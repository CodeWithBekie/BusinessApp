using System.Text.Json;
using AiBusinessPlatform.Api.Contracts;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using Microsoft.Extensions.AI;

namespace AiBusinessPlatform.Api.Endpoints;

public static class AssistantEndpoints
{
    private const string SystemPrompt =
        "You are the \"AI Business Brain\" — an internal analytics and knowledge assistant for the " +
        "business owner viewing this dashboard (Section 10.2/6.3 FR21). You are NOT the customer-facing " +
        "WhatsApp ordering assistant; you never take orders, reserve stock, or handle payments. Follow " +
        "these rules:\n" +
        "1. If the owner asks about revenue, orders, or sales performance (e.g. \"why are profits down\", " +
        "\"how did we do this week\"), call get_sales_summary with an appropriate range (\"today\", \"7d\", " +
        "\"30d\", or \"all\") before answering — never guess numbers.\n" +
        "2. If the owner asks a policy/FAQ-style question about their own business (e.g. something they've " +
        "uploaded as a document), call search_business_documents before answering. If it returns relevant " +
        "content, answer using only that content and end your reply with a citation line in the form " +
        "\"(Source: <document title>)\" for each document used. If it returns nothing relevant, say so " +
        "honestly rather than guessing.\n" +
        "3. Be concise and analytical — this is a business owner reviewing their own numbers, not a " +
        "customer conversation.";

    // Section 10.2/10.6 FR21 — real streaming "AI Business Brain" chat: RAG-grounded and backed by
    // the same sales-insights function the dashboard's Sales tab and the MCP server use (Section
    // 10.7's "one function, multiple entry points"). SSE framing: each event is a JSON object —
    // {"type":"token","text":...} while streaming, then a single {"type":"done","citations":[...]}
    // (or {"type":"error","message":...} on failure) to close the stream.
    public static void MapAssistantEndpoints(this WebApplication app)
    {
        app.MapPost("/api/assistant/chat", async (
            AssistantChatRequest request, IChatClient chatClient, IRagTools ragTools, IInsightsTools insightsTools,
            ICurrentTenantProvider tenantProvider, HttpResponse response, CancellationToken cancellationToken) =>
        {
            response.Headers.ContentType = "text/event-stream";
            response.Headers.CacheControl = "no-cache";

            var businessId = tenantProvider.CurrentBusinessId;
            var citedDocumentTitles = new List<string>();

            var history = new List<ChatMessage> { new(ChatRole.System, SystemPrompt) };
            history.AddRange(request.Messages.Select(m => new ChatMessage(
                string.Equals(m.Role, "assistant", StringComparison.OrdinalIgnoreCase) ? ChatRole.Assistant : ChatRole.User,
                m.Content)));

            var searchDocumentsTool = AIFunctionFactory.Create(
                async (string query) =>
                {
                    var results = await ragTools.RetrieveRelevantDocumentsAsync(businessId, query, cancellationToken);
                    foreach (var title in results.Select(r => r.DocumentTitle).Distinct())
                    {
                        if (!citedDocumentTitles.Contains(title))
                        {
                            citedDocumentTitles.Add(title);
                        }
                    }
                    return results;
                },
                "search_business_documents",
                "Searches this business's own uploaded documents (policies, FAQs, notes) for content relevant to a free-text question.");

            var salesSummaryTool = AIFunctionFactory.Create(
                (string range) => insightsTools.GetSalesSummaryAsync(businessId, range, cancellationToken),
                "get_sales_summary",
                "Gets a sales summary — order count, revenue by currency, daily trend, and top-selling items — for a time range: \"today\", \"7d\", \"30d\", or \"all\".");

            var chatOptions = new ChatOptions { Tools = [searchDocumentsTool, salesSummaryTool] };

            try
            {
                await foreach (var update in chatClient.GetStreamingResponseAsync(history, chatOptions, cancellationToken))
                {
                    foreach (var content in update.Contents)
                    {
                        if (content is TextContent { Text.Length: > 0 } text)
                        {
                            await WriteSseAsync(response, new { type = "token", text = text.Text }, cancellationToken);
                        }
                    }
                }

                await WriteSseAsync(response, new { type = "done", citations = citedDocumentTitles }, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                await WriteSseAsync(response, new { type = "error", message = ex.Message }, cancellationToken);
            }
        }).RequireAuthorization();
    }

    private static async Task WriteSseAsync(HttpResponse response, object payload, CancellationToken cancellationToken)
    {
        await response.WriteAsync($"data: {JsonSerializer.Serialize(payload)}\n\n", cancellationToken);
        await response.Body.FlushAsync(cancellationToken);
    }
}
