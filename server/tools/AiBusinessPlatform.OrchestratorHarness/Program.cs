using System.ClientModel;
using System.Text.Json;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Infrastructure.Data;
using AiBusinessPlatform.Infrastructure.Payments;
using AiBusinessPlatform.Infrastructure.Tools;
using AiBusinessPlatform.Infrastructure.WhatsApp;
using AiBusinessPlatform.OrchestratorHarness.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Configuration.UserSecrets;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using OpenAI;

// ContentRootPath defaults to Directory.GetCurrentDirectory(), which varies depending on how this
// is launched (e.g. `dotnet run --project tools/...` from a different directory doesn't change
// cwd) — pin it to the built assembly's own directory so appsettings.json always resolves.
var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory
});

// The generic Host only auto-loads user-secrets when EnvironmentName == "Development", which
// isn't set by default for a plain console app (no launchSettings.json). This is a dev-only tool,
// so load user-secrets unconditionally rather than requiring DOTNET_ENVIRONMENT to be set.
builder.Configuration.AddUserSecrets(typeof(Program).Assembly, optional: true);

builder.Services.AddDbContext<AiBusinessPlatformDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default"), o => o.UseVector()));

builder.Services.AddScoped<ICurrentTenantProvider, FixedDevTenantProvider>();
builder.Services.AddScoped<ICatalogTools, CatalogTools>();

// The harness's dev business never has a PaynowConnection configured, so CreatePaymentRequestAsync
// always takes the manual/offline fallback path — IPaynowClient is only registered here to satisfy
// OrderTools' constructor dependency, never actually called.
builder.Services.Configure<PaynowOptions>(builder.Configuration.GetSection(PaynowOptions.SectionName));
builder.Services.AddHttpClient<IPaynowClient, PaynowClient>();
builder.Services.AddScoped<IPaymentTools, PaymentTools>();

// OrderTools' receipt/cancellation-notice messages now go through IWhatsAppMessageService (which
// needs IWhatsAppSender) instead of only writing a DB row — the harness's dev business never has a
// WhatsAppConnection configured either, so this always takes the "no connection" fallback path,
// same accepted shape as the IPaynowClient registration above.
builder.Services.Configure<WhatsAppOptions>(builder.Configuration.GetSection(WhatsAppOptions.SectionName));
builder.Services.AddHttpClient<IWhatsAppSender, WhatsAppGraphClient>(client =>
{
    client.BaseAddress = new Uri("https://graph.facebook.com/");
});
builder.Services.AddScoped<IWhatsAppMessageService, WhatsAppMessageService>();
builder.Services.AddScoped<IOrderTools, OrderTools>();

using var host = builder.Build();
using var scope = host.Services.CreateScope();

var catalogTools = scope.ServiceProvider.GetRequiredService<ICatalogTools>();
var orderTools = scope.ServiceProvider.GetRequiredService<IOrderTools>();
var tenantProvider = scope.ServiceProvider.GetRequiredService<ICurrentTenantProvider>();

// The harness has no real WhatsApp Customer/Conversation resolution (that's
// WhatsAppOrchestratorConsumer's job) — Order.CustomerId is just an opaque grouping key with no FK
// constraint, so a fixed placeholder is enough to exercise the order flow here.
var harnessCustomerId = Guid.Parse("00000000-0000-0000-0000-0000000000ff");

var lmStudioConfig = builder.Configuration.GetSection("LmStudio");
var baseUrl = lmStudioConfig["BaseUrl"] ?? "http://localhost:1234/v1";
var model = lmStudioConfig["Model"] ?? throw new InvalidOperationException("LmStudio:Model is not configured (appsettings.json).");
var apiKey = lmStudioConfig["ApiKey"] ?? "lm-studio";

var openAIClient = new OpenAIClient(new ApiKeyCredential(apiKey), new OpenAIClientOptions { Endpoint = new Uri(baseUrl) });
IChatClient innerChatClient = openAIClient.GetChatClient(model).AsIChatClient();
IChatClient chatClient = new ChatClientBuilder(innerChatClient).UseFunctionInvocation().Build();

// The model only ever supplies itemQuery/itemId/quantity — businessId/customerId always come from
// the ambient tenant context, never from the model (Section 9.3: tenant context is loaded, never
// inferred).
var checkAvailabilityTool = AIFunctionFactory.Create(
    (string itemQuery) => catalogTools.CheckAvailabilityAsync(tenantProvider.CurrentBusinessId, itemQuery),
    "check_catalog_availability",
    "Finds catalog items matching a free-text query and returns price/stock availability.");

var reserveStockTool = AIFunctionFactory.Create(
    (Guid itemId, int quantity) => catalogTools.ReserveStockAsync(tenantProvider.CurrentBusinessId, harnessCustomerId, itemId, quantity),
    "reserve_stock",
    "Reserves a quantity of a catalog item for the customer's current order, after they've explicitly confirmed they want to buy it. Decrements available stock immediately.");

var releaseStockTool = AIFunctionFactory.Create(
    (string itemQuery) => catalogTools.ReleaseStockAsync(tenantProvider.CurrentBusinessId, harnessCustomerId, itemQuery),
    "release_stock_reservation",
    "Cancels a previously reserved item on the customer's current order by name (e.g. \"cement\"), restoring its stock — use this when the customer changed their mind before paying.");

var createInvoiceTool = AIFunctionFactory.Create(
    () => orderTools.CreateInvoiceAsync(tenantProvider.CurrentBusinessId, harnessCustomerId),
    "create_invoice",
    "Creates the invoice and payment reference for everything the customer has reserved so far. Only call this after the customer has confirmed all items they want and at least one item has been reserved.");

var chatOptions = new ChatOptions { Tools = [checkAvailabilityTool, reserveStockTool, releaseStockTool, createInvoiceTool] };

var history = new List<ChatMessage>
{
    new(ChatRole.System,
        "You are a WhatsApp order-taking assistant for a hardware store, handling the full " +
        "order-to-cash flow. Follow these rules strictly:\n" +
        "1. When a customer asks about an item's availability or price, use check_catalog_availability " +
        "before answering — never guess.\n" +
        "2. Only call reserve_stock after the customer has EXPLICITLY confirmed they want to buy a " +
        "specific item and quantity (e.g. \"yes, 2 bags of cement please\") — never reserve stock " +
        "just because an item was mentioned, asked about, or compared.\n" +
        "3. If reserve_stock reports insufficient stock, tell the customer honestly and offer " +
        "alternatives or a smaller quantity — never claim something is reserved if it wasn't.\n" +
        "4. If the customer wants to remove or cancel an item they already confirmed (before " +
        "paying), call release_stock_reservation with that item's name.\n" +
        "5. Once the customer has confirmed everything they want to order and at least one item is " +
        "reserved, call create_invoice exactly once to generate the total and payment reference. " +
        "Read the total and payment reference back to the customer clearly, and tell them you'll " +
        "confirm once payment is received — do not claim payment is already received.\n" +
        "6. Never mark anything as paid yourself — payment confirmation happens outside this " +
        "conversation. If the customer claims they already paid, tell them you'll check and get " +
        "back to them; do not change any order status based on their claim alone.\n" +
        "7. Be concise, like a real WhatsApp reply.")
};

Console.WriteLine($"Orchestrator harness ready. Model: {model} @ {baseUrl}");
Console.WriteLine("Type a message (or 'exit' to quit). Piped/EOF input also exits cleanly.");
Console.WriteLine();

string? line;
while ((line = Console.In.ReadLine()) is not null)
{
    if (string.IsNullOrWhiteSpace(line))
    {
        continue;
    }

    if (line.Trim().Equals("exit", StringComparison.OrdinalIgnoreCase) || line.Trim().Equals("quit", StringComparison.OrdinalIgnoreCase))
    {
        break;
    }

    history.Add(new ChatMessage(ChatRole.User, line));

    ChatResponse response;
    try
    {
        response = await chatClient.GetResponseAsync(history, chatOptions);
    }
    catch (ClientResultException ex) when (ex.Status == 401)
    {
        Console.WriteLine($"[error] Authentication failed calling LM Studio at {baseUrl}. If LM " +
            "Studio's 'require API token' setting is still enabled, disable it in LM Studio's " +
            "Developer/Server settings, or set LmStudio:ApiKey (via dotnet user-secrets) to match it.");
        continue;
    }
    catch (HttpRequestException ex)
    {
        Console.WriteLine($"[error] Could not reach LM Studio at {baseUrl} — is the local server running? ({ex.Message})");
        continue;
    }
    catch (ClientResultException ex)
    {
        Console.WriteLine($"[error] LM Studio returned an error (status {ex.Status}): {ex.Message}. " +
            "This may mean the connected model doesn't support function calling — check LM Studio's model card.");
        continue;
    }

    foreach (var message in response.Messages)
    {
        foreach (var content in message.Contents)
        {
            switch (content)
            {
                case FunctionCallContent call:
                    var callArgs = call.Arguments is null
                        ? string.Empty
                        : string.Join(", ", call.Arguments.Select(kv => $"{kv.Key}={JsonSerializer.Serialize(kv.Value)}"));
                    Console.WriteLine($"[tool call] {call.Name}({callArgs})");
                    break;
                case FunctionResultContent result:
                    Console.WriteLine($"[tool result] {JsonSerializer.Serialize(result.Result)}");
                    break;
            }
        }
    }

    history.AddRange(response.Messages);
    Console.WriteLine($"assistant> {response.Text}");
    Console.WriteLine();
}
