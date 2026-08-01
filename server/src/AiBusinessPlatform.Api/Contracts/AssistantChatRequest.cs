using System.Text.Json;

namespace AiBusinessPlatform.Api.Contracts;

public record AssistantChatMessage(string Role, string Content);

// No server-side conversation persistence this pass (Phase 0 simplification, same category as
// mobile's in-memory-only session) — the client resends its own message history every call.
// AttachedResourceUris are MCP resource URIs (e.g. "business://orders/{id}") the user picked to
// attach as context — read server-side and prepended to the chat history, since resources aren't
// part of the model's automatic tool-calling loop.
public record AssistantChatRequest(IReadOnlyList<AssistantChatMessage> Messages, IReadOnlyList<string>? AttachedResourceUris = null);

public record AssistantResourceSummary(string Uri, string? Name, string? Title);

// Backs the "Attach" picker's live search box — candidate id values for a partially-typed resource
// template argument (e.g. orderId), from the Mcp server's "completions" capability.
public record AssistantCompletionResponse(IReadOnlyList<string> Values);

// A resolved MCP prompt — Title is the chip's display label, Message is the actual text sent when
// tapped (see AssistantEndpoints.cs's GET /api/assistant/prompts remarks for why these can differ).
public record AssistantPromptResponse(string Name, string Title, string Message);

// The mobile answer to a mid-conversation elicitation form, submitted via a separate HTTP request
// while the original /api/assistant/chat request is still open awaiting it (see ElicitationRegistry).
public record ElicitationAnswerRequest(string Action, IReadOnlyDictionary<string, JsonElement>? Content);
