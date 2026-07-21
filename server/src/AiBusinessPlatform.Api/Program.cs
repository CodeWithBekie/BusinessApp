using AiBusinessPlatform.Api.Endpoints;
using AiBusinessPlatform.Api.Tenancy;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Infrastructure.Data;
using AiBusinessPlatform.Infrastructure.Messaging;
using AiBusinessPlatform.Infrastructure.Tools;
using Microsoft.EntityFrameworkCore;

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
builder.Services.AddScoped<IPaymentTools, PaymentTools>();
builder.Services.AddScoped<IDeliveryTools, DeliveryTools>();
builder.Services.AddScoped<IApprovalTools, ApprovalTools>();
builder.Services.AddScoped<IRagTools, RagTools>();

builder.Services.AddHealthChecks()
    .AddNpgSql(builder.Configuration.GetConnectionString("Default") ?? string.Empty, name: "postgres");

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
