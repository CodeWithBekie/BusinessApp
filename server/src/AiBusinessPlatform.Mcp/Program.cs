using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Auth;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Infrastructure.AI;
using AiBusinessPlatform.Infrastructure.Auth;
using AiBusinessPlatform.Infrastructure.Data;
using AiBusinessPlatform.Infrastructure.Ledger;
using AiBusinessPlatform.Infrastructure.Payments;
using AiBusinessPlatform.Infrastructure.Tools;
using AiBusinessPlatform.Infrastructure.WhatsApp;
using AiBusinessPlatform.Mcp.Completions;
using AiBusinessPlatform.Mcp.DevTools;
using AiBusinessPlatform.Mcp.Prompts;
using AiBusinessPlatform.Mcp.Resources;
using AiBusinessPlatform.Mcp.Tools;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpContextAccessor();

// Dev-only: lets a browser-based MCP client (e.g. the MCP Inspector web UI) call this server
// directly. The Api project's own Assistant endpoints never need this — that's a server-to-server
// McpClient call, not a browser fetch — so this is scoped to Development and not something a
// deployed instance of this host ever enables.
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
        policy.SetIsOriginAllowed(origin => new Uri(origin).IsLoopback)
            .AllowAnyHeader()
            .AllowAnyMethod()));

    // Dev-only OAuth 2.0 shim (DevOAuthEndpoints) so the MCP Inspector — which speaks OAuth, not
    // this host's real JWT bearer scheme — can obtain a token and connect. See that file's remarks.
    builder.Services.AddSingleton<DevOAuthStateStore>();
}

builder.Services.AddDbContext<AiBusinessPlatformDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default"), o => o.UseVector()));

// Section 14/15 — real per-business JWT auth, identical to the Api project (shared
// AddPlatformJwtAuthentication/JwtOptions), so an MCP call authenticates as the same business the
// caller is already logged in as. Replaces the old FixedDevTenantProvider dev stand-in.
builder.Services.AddPlatformJwtAuthentication(builder.Configuration);
builder.Services.AddScoped<HttpBusinessIdTenantProvider>();
builder.Services.AddScoped<ICurrentTenantProvider>(sp => sp.GetRequiredService<HttpBusinessIdTenantProvider>());
builder.Services.AddScoped<ICurrentTenantSetter>(sp => sp.GetRequiredService<HttpBusinessIdTenantProvider>());
builder.Services.AddScoped<ICurrentUserProvider>(sp => sp.GetRequiredService<HttpBusinessIdTenantProvider>());
builder.Services.AddScoped<ICurrentUserRoleProvider>(sp => sp.GetRequiredService<HttpBusinessIdTenantProvider>());
builder.Services.AddScoped<IPermissionChecker, PermissionChecker>();

// Section: customer dashboard/assistant redesign — the customer JWT's own identity, independent of
// tenant context (returns null rather than throwing when absent, e.g. a business caller). Needed by
// MarketplaceMcpTools; not previously registered in this host since only the Api project's REST
// marketplace endpoints used it until now.
builder.Services.AddScoped<ICurrentCustomerProvider, HttpCustomerAccountProvider>();

builder.Services.AddScoped<IHealthTool, HealthTool>();
builder.Services.AddScoped<ICatalogTools, CatalogTools>();
builder.Services.AddScoped<IApprovalTools, ApprovalTools>();
builder.Services.AddScoped<IInsightsTools, InsightsTools>();

// mark_order_fulfilled needs IOrderTools, which in turn needs IPaymentTools/IPaynowClient to
// satisfy its constructor — a business without a PaynowConnection simply never exercises the real
// Paynow call path (same accepted shape as OrchestratorHarness/Program.cs).
builder.Services.Configure<PaynowOptions>(builder.Configuration.GetSection(PaynowOptions.SectionName));
builder.Services.AddHttpClient<IPaynowClient, PaynowClient>();

// Real EcoCash Instant Payment sandbox calls — a genuine alternate gateway alongside Paynow above,
// not a replacement (PaymentTools.CreatePaymentRequestAsync checks this connection first). No
// AddHttpClient here — EcoCashClient shells out to curl instead (see its own remarks for why).
builder.Services.Configure<EcoCashOptions>(builder.Configuration.GetSection(EcoCashOptions.SectionName));
builder.Services.AddScoped<IEcoCashClient, EcoCashClient>();
builder.Services.AddScoped<IPaymentTools, PaymentTools>();
builder.Services.AddScoped<IOrderTools, OrderTools>();
builder.Services.AddScoped<IDeliveryTools, DeliveryTools>();

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
builder.Services.AddScoped<IExpenseTools, ExpenseTools>();
builder.Services.AddScoped<IAccountingTools, AccountingTools>();
builder.Services.AddScoped<ILedgerPostingService, LedgerPostingService>();

// Section: customer dashboard/assistant redesign — MarketplaceMcpTools wraps this same
// implementation the REST marketplace endpoints already call (Section 10.7's "one function,
// multiple entry points" convention, extended to a second host project here).
builder.Services.AddScoped<IMarketplaceTools, MarketplaceTools>();

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
    .WithTools<AccountingMcpTools>()
    .WithTools<ExpenseMcpTools>()
    .WithTools<MarketplaceMcpTools>()
    .WithTools<DeliveryMcpTools>()
    .WithResources<BusinessResources>()
    .WithPrompts<OwnerSuggestionPrompts>()
    .WithPrompts<CustomerSuggestionPrompts>()
    .WithCompleteHandler(BusinessCompletionHandler.HandleAsync);

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseCors();
}

app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapDevOAuthEndpoints();
}

app.MapMcp().RequireAuthorization();

app.Run();
