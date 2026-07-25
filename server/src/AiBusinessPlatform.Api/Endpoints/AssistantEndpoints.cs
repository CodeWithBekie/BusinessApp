using System.Text;
using System.Text.Json;
using AiBusinessPlatform.Api.Assistant;
using AiBusinessPlatform.Api.Contracts;
using AiBusinessPlatform.Application.Abstractions;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;
using ModelContextProtocol;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;

namespace AiBusinessPlatform.Api.Endpoints;

public static class AssistantEndpoints
{
    private const string SystemPrompt =
        "You are the \"AI Business Brain\" — a conversational assistant for the business owner " +
        "viewing this dashboard (Section 10.2/6.3 FR21), covering catalog, orders, approvals, sales, " +
        "and their own uploaded documents. You are NOT the customer-facing WhatsApp ordering " +
        "assistant — you talk to the owner, not their customers. Behave like a knowledgeable, " +
        "conversational coworker (not a rigid script), but follow these rules strictly:\n" +
        "1. Before stating any fact about the business (sales figures, catalog items, order status, " +
        "pending approvals), call the relevant query tool first — never guess or make up numbers.\n" +
        "2. Only call a mutating tool (create_catalog_item, update_catalog_item, mark_order_fulfilled, " +
        "decide_approval) when the owner's own most recent message clearly and explicitly asks for " +
        "that exact action. If it's ambiguous which item/order/approval they mean, or what they " +
        "actually want done, ask a short clarifying question instead of guessing and acting.\n" +
        "3. After a mutating action succeeds, clearly confirm exactly what changed (e.g. \"Marked " +
        "order #1234 as fulfilled\" or \"Added 'Premium Widget' to your catalog at USD 25.00\").\n" +
        "4. For policy/FAQ-style questions, call search_business_documents before answering. If it " +
        "returns relevant content, answer using only that content and end with a citation line in " +
        "the form \"(Source: <document title>)\" for each document used. If nothing relevant comes " +
        "back, say so honestly rather than guessing.\n" +
        "5. Be concise but conversational — this is a business owner chatting with their own " +
        "assistant, not filling out a form.";

    // Section 10.2/10.7 FR21 — real streaming "AI Business Brain" chat. The Assistant is itself an
    // MCP client of the platform's own MCP server (AiBusinessPlatform.Mcp): it forwards the
    // caller's own bearer token so MCP tool calls run under the same authenticated business, then
    // hands the server's tool list straight to ChatOptions.Tools — there is exactly one tool
    // surface in the whole system (external MCP clients use the identical one). SSE framing: each
    // event is a JSON object — {"type":"token","text":...} while streaming, then a single
    // {"type":"done","citations":[...],"toolsUsed":[...]} (or {"type":"error","message":...} on
    // failure) to close the stream.
    public static void MapAssistantEndpoints(this WebApplication app)
    {
        // Lets the mobile "Attach" picker enumerate resources/templates before the user sends a
        // message — resources aren't part of the model's automatic tool-calling loop, so the host
        // (this endpoint's caller) decides what to attach, matching how a real MCP host works.
        app.MapGet("/api/assistant/resources", async (
            IOptions<McpServerOptions> mcpServerOptions, HttpRequest httpRequest, CancellationToken cancellationToken) =>
        {
            var transport = new HttpClientTransport(new HttpClientTransportOptions
            {
                Endpoint = new Uri(mcpServerOptions.Value.BaseUrl),
                AdditionalHeaders = new Dictionary<string, string> { ["Authorization"] = httpRequest.Headers.Authorization.ToString() }
            });

            await using var mcpClient = await McpClient.CreateAsync(transport, cancellationToken: cancellationToken);
            var resources = await mcpClient.ListResourcesAsync(cancellationToken: cancellationToken);
            var templates = await mcpClient.ListResourceTemplatesAsync(cancellationToken: cancellationToken);

            var summaries = resources.Select(r => new AssistantResourceSummary(r.Uri, r.Name, r.Title))
                .Concat(templates.Select(t => new AssistantResourceSummary(t.UriTemplate, t.Name, t.Title)))
                .ToList();
            return Results.Ok(summaries);
        }).RequireAuthorization();

        // Resolves a pending elicitation raised mid-tool-call by the still-open /api/assistant/chat
        // request above — see ElicitationRegistry's remarks for why this needs a second endpoint at
        // all (SSE is one-directional; the human's answer has to arrive over a fresh request).
        app.MapPost("/api/assistant/elicit/{elicitationId:guid}", (
            Guid elicitationId, ElicitationAnswerRequest request, ElicitationRegistry elicitationRegistry, ICurrentTenantProvider tenantProvider) =>
        {
            var resolved = elicitationRegistry.TryResolve(elicitationId, tenantProvider.CurrentBusinessId, new ElicitationAnswer(request.Action, request.Content));
            return resolved ? Results.NoContent() : Results.NotFound();
        }).RequireAuthorization();

        app.MapPost("/api/assistant/chat", async (
            AssistantChatRequest request, IChatClient chatClient, IOptions<McpServerOptions> mcpServerOptions,
            ElicitationRegistry elicitationRegistry, ICurrentTenantProvider tenantProvider,
            HttpRequest httpRequest, HttpResponse response, CancellationToken cancellationToken) =>
        {
            response.Headers.ContentType = "text/event-stream";
            response.Headers.CacheControl = "no-cache";

            var history = new List<ChatMessage> { new(ChatRole.System, SystemPrompt) };
            var businessId = tenantProvider.CurrentBusinessId;

            try
            {
                var authHeader = httpRequest.Headers.Authorization.ToString();

                var transport = new HttpClientTransport(new HttpClientTransportOptions
                {
                    Endpoint = new Uri(mcpServerOptions.Value.BaseUrl),
                    AdditionalHeaders = new Dictionary<string, string> { ["Authorization"] = authHeader }
                });

                var mcpClientOptions = new McpClientOptions
                {
                    // Must be advertised explicitly during MCP initialize — setting only the
                    // handlers below is not enough; the server rejects SampleAsync/ElicitAsync
                    // with "Client does not support sampling"/elicitation otherwise (confirmed
                    // live — see plan's "open item").
                    Capabilities = new ClientCapabilities { Sampling = new SamplingCapability(), Elicitation = new ElicitationCapability() },
                    Handlers = new McpClientHandlers
                    {
                        // Satisfies the MCP server's sampling requests (e.g. draft_customer_message)
                        // using the SAME LM Studio-backed IChatClient this endpoint already uses for
                        // the conversation itself — the server never needs its own model/API key.
                        SamplingHandler = chatClient.CreateSamplingHandler(),

                        // Pauses this in-flight tool call: pushes a form-request frame down this
                        // same SSE stream, then blocks until the human answers it via the separate
                        // POST /api/assistant/elicit/{id} endpoint above (or the timeout lapses).
                        ElicitationHandler = async (elicitRequest, elicitCancellationToken) =>
                        {
                            var elicitationId = elicitationRegistry.Register(businessId);
                            await WriteSseAsync(response, new
                            {
                                type = "elicitation_request",
                                elicitationId,
                                message = elicitRequest?.Message,
                                schema = elicitRequest?.RequestedSchema
                            }, elicitCancellationToken);

                            var answer = await elicitationRegistry.AwaitAnswerAsync(elicitationId, TimeSpan.FromMinutes(3), elicitCancellationToken);
                            return new ElicitResult { Action = answer.Action, Content = answer.Content?.ToDictionary(kv => kv.Key, kv => kv.Value) };
                        }
                    }
                };

                await using var mcpClient = await McpClient.CreateAsync(transport, mcpClientOptions, cancellationToken: cancellationToken);

                // Attached resources are read here and folded into the history as context — the
                // model never "calls" a resource like a tool, it's just given the content.
                if (request.AttachedResourceUris is { Count: > 0 } attachedUris)
                {
                    var contextBuilder = new StringBuilder("The user has attached the following business data as context:\n\n");
                    foreach (var uri in attachedUris)
                    {
                        var read = await mcpClient.ReadResourceAsync(uri, cancellationToken: cancellationToken);
                        var text = string.Join("\n", read.Contents.OfType<TextResourceContents>().Select(c => c.Text));
                        contextBuilder.AppendLine($"--- {uri} ---");
                        contextBuilder.AppendLine(text);
                        contextBuilder.AppendLine();
                    }
                    history.Add(new ChatMessage(ChatRole.System, contextBuilder.ToString()));
                }

                history.AddRange(request.Messages.Select(m => new ChatMessage(
                    string.Equals(m.Role, "assistant", StringComparison.OrdinalIgnoreCase) ? ChatRole.Assistant : ChatRole.User,
                    m.Content)));

                var mcpTools = await mcpClient.ListToolsAsync(cancellationToken: cancellationToken);

                var chatOptions = new ChatOptions { Tools = mcpTools.Select(t => (AITool)t).ToList() };

                var citedDocumentTitles = new List<string>();
                var toolsUsed = new List<string>();

                await foreach (var update in chatClient.GetStreamingResponseAsync(history, chatOptions, cancellationToken))
                {
                    foreach (var content in update.Contents)
                    {
                        switch (content)
                        {
                            case TextContent { Text.Length: > 0 } text:
                                await WriteSseAsync(response, new { type = "token", text = text.Text }, cancellationToken);
                                break;

                            case FunctionCallContent call:
                                if (!toolsUsed.Contains(call.Name))
                                {
                                    toolsUsed.Add(call.Name);
                                }
                                break;

                            case FunctionResultContent { Result: not null } result when toolsUsed.Contains("search_business_documents"):
                                // Best-effort citation extraction from the raw tool result JSON —
                                // the MCP tool result comes back as a string, not the strongly-typed
                                // RetrievedDocumentChunk list the in-process version used.
                                TryExtractDocumentTitles(result.Result, citedDocumentTitles);
                                break;
                        }
                    }
                }

                await WriteSseAsync(response, new { type = "done", citations = citedDocumentTitles, toolsUsed }, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                await WriteSseAsync(response, new { type = "error", message = ex.Message }, cancellationToken);
            }
        }).RequireAuthorization();
    }

    // The MCP result payload for search_business_documents is a JSON-serialized
    // RetrievedDocumentChunk[] (see RagMcpTools) — pull out documentTitle without a hard
    // dependency on that Application-layer type (the Api project talks to the Mcp server purely
    // over the wire, not in-process).
    private static void TryExtractDocumentTitles(object rawResult, List<string> citedDocumentTitles)
    {
        try
        {
            var json = rawResult is string s ? s : JsonSerializer.Serialize(rawResult);
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                return;
            }

            foreach (var element in doc.RootElement.EnumerateArray())
            {
                if (element.TryGetProperty("documentTitle", out var titleProp) && titleProp.GetString() is { Length: > 0 } title
                    && !citedDocumentTitles.Contains(title))
                {
                    citedDocumentTitles.Add(title);
                }
            }
        }
        catch (JsonException)
        {
            // Not parseable as the expected shape — skip citations for this call rather than fail the turn.
        }
    }

    private static async Task WriteSseAsync(HttpResponse response, object payload, CancellationToken cancellationToken)
    {
        await response.WriteAsync($"data: {JsonSerializer.Serialize(payload)}\n\n", cancellationToken);
        await response.Body.FlushAsync(cancellationToken);
    }
}
