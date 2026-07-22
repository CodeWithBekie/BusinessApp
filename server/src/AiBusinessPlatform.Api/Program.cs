using AiBusinessPlatform.Api.Auth;
using AiBusinessPlatform.Api.Endpoints;
using AiBusinessPlatform.Api.Orchestrator;
using AiBusinessPlatform.Api.Payments;
using AiBusinessPlatform.Api.Tenancy;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using AiBusinessPlatform.Infrastructure.Messaging;
using AiBusinessPlatform.Infrastructure.Tools;
using AiBusinessPlatform.Infrastructure.WhatsApp;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Microsoft.IdentityModel.Tokens;
using OpenAI;
using System.ClientModel;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddHttpContextAccessor();

// Enums (order/approval/catalog-item/WhatsApp-connection status, etc.) serialize as readable
// names instead of raw ints — the only consumer of this Api's JSON today is the mobile dashboard.
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));

builder.Services.AddDbContext<AiBusinessPlatformDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default"), o => o.UseVector()));

builder.Services.Configure<RabbitMqOptions>(builder.Configuration.GetSection(RabbitMqOptions.SectionName));
builder.Services.AddSingleton<IQueuePublisher, RabbitMqQueuePublisher>();

// Resolves business_id from the authenticated JWT's business_id claim (Section 14). Registered as
// ONE scoped instance forwarded to both interfaces — a naive AddScoped<T> per interface would
// create two separate instances and break WhatsAppOrchestratorConsumer's SetBusinessId call
// (Section 9.3), which pushes a business_id resolved outside any HttpContext into this same
// scoped instance.
builder.Services.AddScoped<HttpBusinessIdTenantProvider>();
builder.Services.AddScoped<ICurrentTenantProvider>(sp => sp.GetRequiredService<HttpBusinessIdTenantProvider>());
builder.Services.AddScoped<ICurrentTenantSetter>(sp => sp.GetRequiredService<HttpBusinessIdTenantProvider>());

// Section 15 — JWT auth. PasswordHasher<BusinessUser> + a hand-issued JWT satisfy "ASP.NET Core
// Identity or an equivalent" without adopting full Identity's UserManager/table scaffolding.
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.AddSingleton<IPasswordHasher<BusinessUser>, PasswordHasher<BusinessUser>>();

var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
    ?? throw new InvalidOperationException("Jwt configuration section is missing.");
if (string.IsNullOrWhiteSpace(jwtOptions.SigningKey))
{
    throw new InvalidOperationException("Jwt:SigningKey is not configured (dotnet user-secrets).");
}

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Without this, the handler remaps short JWT claim names (e.g. "sub") to legacy long-form
        // URIs on the way in (JwtSecurityTokenHandler.DefaultInboundClaimTypeMap) — so a claim
        // issued as "sub" is no longer findable via that same name once the principal is built.
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.SigningKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });
builder.Services.AddAuthorization();

// Section 10.3/10.7 tool contracts — same registrations the Mcp project's host uses, so both
// entry points resolve to identical implementations.
builder.Services.AddScoped<IHealthTool, HealthTool>();
builder.Services.AddScoped<ICatalogTools, CatalogTools>();
builder.Services.AddScoped<IOrderTools, OrderTools>();
builder.Services.AddScoped<IPaymentTools, PaymentTools>();
builder.Services.AddScoped<IDeliveryTools, DeliveryTools>();
builder.Services.AddScoped<IApprovalTools, ApprovalTools>();
builder.Services.AddScoped<IRagTools, RagTools>();

builder.Services.AddHealthChecks()
    .AddNpgSql(builder.Configuration.GetConnectionString("Default") ?? string.Empty, name: "postgres");

// Section 10.2 — the same LM Studio + tool-calling recipe already proven in the
// OrchestratorHarness console app, now wired into a real hosted service.
builder.Services.Configure<LmStudioOptions>(builder.Configuration.GetSection(LmStudioOptions.SectionName));
builder.Services.AddSingleton<IChatClient>(sp =>
{
    var options = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<LmStudioOptions>>().Value;
    if (string.IsNullOrWhiteSpace(options.Model))
    {
        throw new InvalidOperationException("LmStudio:Model is not configured (appsettings.json).");
    }

    var openAIClient = new OpenAIClient(
        new ApiKeyCredential(options.ApiKey),
        new OpenAIClientOptions { Endpoint = new Uri(options.BaseUrl) });

    IChatClient innerChatClient = openAIClient.GetChatClient(options.Model).AsIChatClient();
    return new ChatClientBuilder(innerChatClient).UseFunctionInvocation().Build();
});

// Section 10.6 — RAG embeddings, same LM Studio server as the chat client, different model.
builder.Services.AddSingleton<IEmbeddingGenerator<string, Embedding<float>>>(sp =>
{
    var options = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<LmStudioOptions>>().Value;
    if (string.IsNullOrWhiteSpace(options.EmbeddingModel))
    {
        throw new InvalidOperationException("LmStudio:EmbeddingModel is not configured (appsettings.json).");
    }

    var openAIClient = new OpenAIClient(
        new ApiKeyCredential(options.ApiKey),
        new OpenAIClientOptions { Endpoint = new Uri(options.BaseUrl) });

    return openAIClient.GetEmbeddingClient(options.EmbeddingModel).AsIEmbeddingGenerator();
});

// Section 13.1 — real outbound WhatsApp sends via Meta's Graph API. Base address only carries
// the host; WhatsAppGraphClient supplies the versioned path per call. A resilience handler covers
// transient network failures — the app-level try/catch around the send call (see
// WhatsAppOrchestratorConsumer) still handles genuine failures (bad token, no connection, etc.)
// without crashing or nacking the queue message.
builder.Services.Configure<WhatsAppOptions>(builder.Configuration.GetSection(WhatsAppOptions.SectionName));
builder.Services.AddHttpClient<IWhatsAppSender, WhatsAppGraphClient>(client =>
{
    client.BaseAddress = new Uri("https://graph.facebook.com/");
}).AddStandardResilienceHandler();

builder.Services.AddHostedService<WhatsAppOrchestratorConsumer>();
builder.Services.AddHostedService<PaymentWebhookConsumer>();

// Dev-only permissive CORS so the Expo web preview (a different origin/port) can call this Api.
// Native (iOS/Android) builds aren't subject to CORS, so this only matters for the web target.
const string devCorsPolicy = "DevCors";
builder.Services.AddCors(options =>
{
    options.AddPolicy(devCorsPolicy, policy => policy
        .SetIsOriginAllowed(_ => true)
        .AllowAnyHeader()
        .AllowAnyMethod());
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseCors(devCorsPolicy);
}

app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health");

app.MapAuthEndpoints();
app.MapWebhookEndpoints();
app.MapDashboardEndpoints();
app.MapAssistantEndpoints();

app.Run();
