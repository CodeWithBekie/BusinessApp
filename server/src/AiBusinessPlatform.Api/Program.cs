using AiBusinessPlatform.Api.Endpoints;
using AiBusinessPlatform.Api.Orchestrator;
using AiBusinessPlatform.Api.Payments;
using AiBusinessPlatform.Api.Tenancy;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Infrastructure.Data;
using AiBusinessPlatform.Infrastructure.Messaging;
using AiBusinessPlatform.Infrastructure.Tools;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using OpenAI;
using System.ClientModel;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddHttpContextAccessor();

builder.Services.AddDbContext<AiBusinessPlatformDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default"), o => o.UseVector()));

builder.Services.Configure<RabbitMqOptions>(builder.Configuration.GetSection(RabbitMqOptions.SectionName));
builder.Services.AddSingleton<IQueuePublisher, RabbitMqQueuePublisher>();

// Dev-only: resolves business_id from an X-Business-Id header (Section 14 will replace this
// with real JWT-claim-based resolution once auth exists).
builder.Services.AddScoped<ICurrentTenantProvider, HttpBusinessIdTenantProvider>();

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

app.MapHealthChecks("/health");

app.MapWebhookEndpoints();
app.MapDashboardEndpoints();
app.MapAssistantEndpoints();

app.Run();
