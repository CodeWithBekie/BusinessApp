namespace AiBusinessPlatform.Api.Contracts;

public record AssistantChatMessage(string Role, string Content);

// No server-side conversation persistence this pass (Phase 0 simplification, same category as
// mobile's in-memory-only session) — the client resends its own message history every call.
public record AssistantChatRequest(IReadOnlyList<AssistantChatMessage> Messages);
