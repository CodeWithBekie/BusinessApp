using System.ClientModel;
using System.Text.Json;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Infrastructure.Data;
using AiBusinessPlatform.Infrastructure.Tools;
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

using var host = builder.Build();
using var scope = host.Services.CreateScope();

var catalogTools = scope.ServiceProvider.GetRequiredService<ICatalogTools>();
var tenantProvider = scope.ServiceProvider.GetRequiredService<ICurrentTenantProvider>();

var lmStudioConfig = builder.Configuration.GetSection("LmStudio");
var baseUrl = lmStudioConfig["BaseUrl"] ?? "http://localhost:1234/v1";
var model = lmStudioConfig["Model"] ?? throw new InvalidOperationException("LmStudio:Model is not configured (appsettings.json).");
var apiKey = lmStudioConfig["ApiKey"] ?? "lm-studio";

var openAIClient = new OpenAIClient(new ApiKeyCredential(apiKey), new OpenAIClientOptions { Endpoint = new Uri(baseUrl) });
IChatClient innerChatClient = openAIClient.GetChatClient(model).AsIChatClient();
IChatClient chatClient = new ChatClientBuilder(innerChatClient).UseFunctionInvocation().Build();

// The model only ever supplies itemQuery — businessId always comes from the ambient tenant
// context, never from the model (Section 9.3: tenant context is loaded, never inferred).
var checkAvailabilityTool = AIFunctionFactory.Create(
    (string itemQuery) => catalogTools.CheckAvailabilityAsync(tenantProvider.CurrentBusinessId, itemQuery),
    "check_catalog_availability",
    "Finds catalog items matching a free-text query and returns price/stock availability.");

var chatOptions = new ChatOptions { Tools = [checkAvailabilityTool] };

var history = new List<ChatMessage>
{
    new(ChatRole.System,
        "You are a WhatsApp order-taking assistant for a hardware store. When a customer asks " +
        "about an item's availability or price, use the check_catalog_availability tool to look " +
        "it up before answering — never guess. Be concise, like a real WhatsApp reply.")
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
