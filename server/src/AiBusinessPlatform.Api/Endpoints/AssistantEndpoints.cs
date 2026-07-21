namespace AiBusinessPlatform.Api.Endpoints;

public static class AssistantEndpoints
{
    // Section 12.3 FR21 — streaming "AI Business Brain" chat endpoint. Phase 0 proves the
    // streaming pipe only; real IChatClient-backed orchestration is Phase 2 (Sections 10.2, 10.6).
    public static void MapAssistantEndpoints(this WebApplication app)
    {
        app.MapPost("/api/assistant/chat", async (HttpResponse response, CancellationToken cancellationToken) =>
        {
            response.Headers.ContentType = "text/event-stream";
            response.Headers.CacheControl = "no-cache";

            await response.WriteAsync(
                "data: AI orchestration not yet implemented — Phase 1/2, see product-spec-v1.3 Section 10.2\n\n",
                cancellationToken);
            await response.Body.FlushAsync(cancellationToken);
        });
    }
}
