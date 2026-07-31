using System.Text.Json;

namespace AiBusinessPlatform.Api.Assistant;

// Shared SSE framing helper for both AssistantEndpoints (business) and CustomerAssistantEndpoints
// (marketplace customer) — each event is one JSON object on a single "data: " line.
public static class SseWriter
{
    public static async Task WriteAsync(HttpResponse response, object payload, CancellationToken cancellationToken)
    {
        await response.WriteAsync($"data: {JsonSerializer.Serialize(payload)}\n\n", cancellationToken);
        await response.Body.FlushAsync(cancellationToken);
    }
}
