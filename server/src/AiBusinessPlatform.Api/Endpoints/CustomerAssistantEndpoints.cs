using AiBusinessPlatform.Api.Assistant;
using AiBusinessPlatform.Api.Contracts;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;

namespace AiBusinessPlatform.Api.Endpoints;

public static class CustomerAssistantEndpoints
{
    private const string SystemPrompt =
        "You are the shopping assistant for this marketplace app — you help the customer browse a " +
        "business's catalog, place an order, check on their own orders, cancel or request " +
        "cancellation, and pay. You are NOT the business owner's dashboard assistant; you only ever " +
        "act on this one customer's own orders and money, never anyone else's. Behave like a " +
        "helpful, friendly shop assistant, but follow these rules strictly:\n" +
        "1. Before stating prices, stock, or order status, call the relevant tool first — never " +
        "guess or make up numbers.\n" +
        "2. Resolve names to ids before acting: call list_marketplace_businesses or " +
        "browse_business_catalog to find the right businessId/catalogItemId, and list_my_orders or " +
        "get_my_order to find the right orderId — never guess an id.\n" +
        "3. Only place an order, cancel one, request a cancellation, or initiate a payment when the " +
        "customer's own most recent message clearly and explicitly asks for that exact action. If " +
        "it's ambiguous which item, order, or quantity they mean, ask a short clarifying question " +
        "instead of guessing and acting — these actions spend the customer's own money, so get it " +
        "right the first time.\n" +
        "4. After a mutating action succeeds, clearly confirm exactly what happened, including the " +
        "order id, business name, and amount where relevant (e.g. \"Placed your order with Chipo's " +
        "Grocers — 3 x bread, $12.40 total, pay by EcoCash or bank transfer.\").\n" +
        "5. If EcoCash payment isn't available for a business, tell the customer to use the in-app " +
        "payment proof upload (on the order's details screen) instead of trying to work around it.\n" +
        "6. Be concise and conversational — this is a customer chatting with a shop's ordering " +
        "assistant, not filling out a form.";

    // Section: customer dashboard/assistant redesign — the marketplace counterpart to
    // AssistantEndpoints.MapAssistantEndpoints, structurally identical (SSE streaming, MCP client
    // forwarding the caller's own bearer token) but deliberately simpler: no sampling/elicitation
    // capabilities (every marketplace tool is a single-shot call resolved entirely from what the
    // customer already said — none need a mid-call structured form or server-side draft), and no
    // citations (there's no document/report-grounding concept here; "which order was acted on" is
    // already stated directly in the reply text). ListToolsAsync() below is intentionally
    // unfiltered — a customer session sees the full MCP tool list, same as the business Assistant
    // does today — the real gate is each tool class's own customer/business id check
    // (MarketplaceMcpTools.RequireCustomerAccountId / ICurrentTenantProvider.CurrentBusinessId
    // throwing for the wrong JWT kind), not filtering at this layer.
    // Fixed, known set of customer-facing suggestion prompts (see
    // Mcp/Prompts/CustomerSuggestionPrompts.cs) — mirrors AssistantEndpoints' own SuggestionPrompts.
    private static readonly (string Name, string Title)[] SuggestionPrompts =
    [
        ("what_can_i_order", "What can I order from this business?"),
        ("wheres_my_order", "Where is my order?"),
        ("cancel_last_order", "I want to cancel my last order"),
    ];

    public static void MapCustomerAssistantEndpoints(this WebApplication app)
    {
        // Backs the mobile customer Assistant tab's suggestion chips — see
        // AssistantEndpoints.MapAssistantEndpoints' GET /api/assistant/prompts remarks.
        app.MapGet("/api/customer-assistant/prompts", async (
            IOptions<McpServerOptions> mcpServerOptions, HttpRequest httpRequest, CancellationToken cancellationToken) =>
        {
            var transport = new HttpClientTransport(new HttpClientTransportOptions
            {
                Endpoint = new Uri(mcpServerOptions.Value.BaseUrl),
                AdditionalHeaders = new Dictionary<string, string> { ["Authorization"] = httpRequest.Headers.Authorization.ToString() }
            });

            await using var mcpClient = await McpClient.CreateAsync(transport, cancellationToken: cancellationToken);

            var results = new List<AssistantPromptResponse>();
            foreach (var (name, title) in SuggestionPrompts)
            {
                var result = await mcpClient.GetPromptAsync(name, cancellationToken: cancellationToken);
                var message = result.Messages
                    .Select(m => m.Content)
                    .OfType<TextContentBlock>()
                    .Select(c => c.Text)
                    .FirstOrDefault() ?? title;
                results.Add(new AssistantPromptResponse(name, title, message));
            }
            return Results.Ok(results);
        }).RequireAuthorization("CustomerOnly");

        app.MapPost("/api/customer-assistant/chat", async (
            AssistantChatRequest request, IChatClient chatClient, IOptions<McpServerOptions> mcpServerOptions,
            HttpRequest httpRequest, HttpResponse response, CancellationToken cancellationToken) =>
        {
            response.Headers.ContentType = "text/event-stream";
            response.Headers.CacheControl = "no-cache";

            var history = new List<ChatMessage> { new(ChatRole.System, SystemPrompt) };

            try
            {
                var transport = new HttpClientTransport(new HttpClientTransportOptions
                {
                    Endpoint = new Uri(mcpServerOptions.Value.BaseUrl),
                    AdditionalHeaders = new Dictionary<string, string> { ["Authorization"] = httpRequest.Headers.Authorization.ToString() }
                });

                await using var mcpClient = await McpClient.CreateAsync(transport, cancellationToken: cancellationToken);

                history.AddRange(request.Messages.Select(m => new ChatMessage(
                    string.Equals(m.Role, "assistant", StringComparison.OrdinalIgnoreCase) ? ChatRole.Assistant : ChatRole.User,
                    m.Content)));

                var mcpTools = await mcpClient.ListToolsAsync(cancellationToken: cancellationToken);
                var chatOptions = new ChatOptions { Tools = mcpTools.Select(t => (AITool)t).ToList() };

                var toolsUsed = new List<string>();

                await foreach (var update in chatClient.GetStreamingResponseAsync(history, chatOptions, cancellationToken))
                {
                    foreach (var content in update.Contents)
                    {
                        switch (content)
                        {
                            case TextContent { Text.Length: > 0 } text:
                                await SseWriter.WriteAsync(response, new { type = "token", text = text.Text }, cancellationToken);
                                break;

                            case FunctionCallContent call when !toolsUsed.Contains(call.Name):
                                toolsUsed.Add(call.Name);
                                break;
                        }
                    }
                }

                await SseWriter.WriteAsync(response, new { type = "done", toolsUsed }, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                await SseWriter.WriteAsync(response, new { type = "error", message = ex.Message }, cancellationToken);
            }
        }).RequireAuthorization("CustomerOnly");
    }
}
