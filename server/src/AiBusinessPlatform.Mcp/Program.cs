using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Infrastructure.AI;
using AiBusinessPlatform.Infrastructure.Auth;
using AiBusinessPlatform.Infrastructure.Data;
using AiBusinessPlatform.Infrastructure.Payments;
using AiBusinessPlatform.Infrastructure.Tools;
using AiBusinessPlatform.Infrastructure.WhatsApp;
using AiBusinessPlatform.Mcp.Resources;
using AiBusinessPlatform.Mcp.Tools;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpContextAccessor();

builder.Services.AddDbContext<AiBusinessPlatformDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default"), o => o.UseVector()));

// Section 14/15 — real per-business JWT auth, identical to the Api project (shared
// AddPlatformJwtAuthentication/JwtOptions), so an MCP call authenticates as the same business the
// caller is already logged in as. Replaces the old FixedDevTenantProvider dev stand-in.
builder.Services.AddPlatformJwtAuthentication(builder.Configuration);
builder.Services.AddScoped<HttpBusinessIdTenantProvider>();
builder.Services.AddScoped<ICurrentTenantProvider>(sp => sp.GetRequiredService<HttpBusinessIdTenantProvider>());
builder.Services.AddScoped<ICurrentUserProvider>(sp => sp.GetRequiredService<HttpBusinessIdTenantProvider>());

builder.Services.AddScoped<IHealthTool, HealthTool>();
builder.Services.AddScoped<ICatalogTools, CatalogTools>();
builder.Services.AddScoped<IApprovalTools, ApprovalTools>();
builder.Services.AddScoped<IInsightsTools, InsightsTools>();

// mark_order_fulfilled needs IOrderTools, which in turn needs IPaymentTools/IPaynowClient to
// satisfy its constructor — a business without a PaynowConnection simply never exercises the real
// Paynow call path (same accepted shape as OrchestratorHarness/Program.cs).
builder.Services.Configure<PaynowOptions>(builder.Configuration.GetSection(PaynowOptions.SectionName));
builder.Services.AddHttpClient<IPaynowClient, PaynowClient>();
builder.Services.AddScoped<IPaymentTools, PaymentTools>();
builder.Services.AddScoped<IOrderTools, OrderTools>();

// Section 10.6 — same embedding model RagTools needs for search_business_documents.
builder.Services.Configure<LmStudioOptions>(builder.Configuration.GetSection(LmStudioOptions.SectionName));
builder.Services.AddSingleton<IEmbeddingGenerator<string, Embedding<float>>>(sp =>
    LmStudioEmbeddingGeneratorFactory.Create(sp.GetRequiredService<IOptions<LmStudioOptions>>().Value));
builder.Services.AddScoped<IRagTools, RagTools>();
builder.Services.AddScoped<ICustomerTools, CustomerTools>();
builder.Services.AddScoped<ISupplierTools, SupplierTools>();
builder.Services.AddScoped<IPurchaseOrderTools, PurchaseOrderTools>();

// decide_approval (ApprovalMcpTools) can trigger a real WhatsApp send when a send_customer_message
// approval is approved — this project needs its own IWhatsAppSender registration for that, same as
// the Api project's (Section 13.1).
builder.Services.Configure<WhatsAppOptions>(builder.Configuration.GetSection(WhatsAppOptions.SectionName));
builder.Services.AddHttpClient<IWhatsAppSender, WhatsAppGraphClient>(client =>
{
    client.BaseAddress = new Uri("https://graph.facebook.com/");
}).AddStandardResilienceHandler();
builder.Services.AddScoped<IWhatsAppMessageService, WhatsAppMessageService>();
builder.Services.AddScoped<IMessagingTools, MessagingTools>();

// Section 10.7 — the same C# functions the in-app orchestrator/dashboard/Assistant call, exposed
// as MCP tools. The Assistant chat endpoint (Api project) is itself an MCP client of this server —
// there is exactly one tool surface in the whole system, not a parallel copy.
builder.Services
    .AddMcpServer()
    .WithHttpTransport()
    .WithTools<HealthMcpTools>()
    .WithTools<CatalogMcpTools>()
    .WithTools<RagMcpTools>()
    .WithTools<InsightsMcpTools>()
    .WithTools<OrderMcpTools>()
    .WithTools<ApprovalMcpTools>()
    .WithTools<CustomerMcpTools>()
    .WithTools<SupplierMcpTools>()
    .WithTools<PurchaseOrderMcpTools>()
    .WithTools<CustomerMessagingMcpTools>()
    .WithResources<BusinessResources>();

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapMcp().RequireAuthorization();

app.Run();
