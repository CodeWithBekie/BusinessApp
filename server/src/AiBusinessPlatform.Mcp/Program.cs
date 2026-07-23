using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Infrastructure.AI;
using AiBusinessPlatform.Infrastructure.Data;
using AiBusinessPlatform.Infrastructure.Tools;
using AiBusinessPlatform.Mcp.Tenancy;
using AiBusinessPlatform.Mcp.Tools;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AiBusinessPlatformDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default"), o => o.UseVector()));

builder.Services.AddScoped<ICurrentTenantProvider, FixedDevTenantProvider>();
builder.Services.AddScoped<IHealthTool, HealthTool>();
builder.Services.AddScoped<ICatalogTools, CatalogTools>();
builder.Services.AddScoped<IInsightsTools, InsightsTools>();

// Section 10.6 — same embedding model RagTools needs for search_business_documents.
builder.Services.Configure<LmStudioOptions>(builder.Configuration.GetSection(LmStudioOptions.SectionName));
builder.Services.AddSingleton<IEmbeddingGenerator<string, Embedding<float>>>(sp =>
    LmStudioEmbeddingGeneratorFactory.Create(sp.GetRequiredService<IOptions<LmStudioOptions>>().Value));
builder.Services.AddScoped<IRagTools, RagTools>();

// Section 10.7 — the same C# functions the in-app orchestrator/dashboard call, exposed as MCP
// tools for external AI clients (Claude, ChatGPT, etc.). Deliberately read-only this pass: see
// CatalogMcpTools' doc comment for why order-mutating tools (reserve_stock, create_invoice, etc.)
// aren't exposed here yet — that needs Section 14's real per-business MCP integration-account
// auth first, which FixedDevTenantProvider below is explicitly a stand-in for.
builder.Services
    .AddMcpServer()
    .WithHttpTransport()
    .WithTools<HealthMcpTools>()
    .WithTools<CatalogMcpTools>()
    .WithTools<RagMcpTools>()
    .WithTools<InsightsMcpTools>();

var app = builder.Build();

app.MapMcp();

app.Run();
