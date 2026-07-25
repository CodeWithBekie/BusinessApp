using System.Collections.Concurrent;
using System.Text.Json;

namespace AiBusinessPlatform.Api.Assistant;

public record ElicitationAnswer(string Action, IReadOnlyDictionary<string, JsonElement>? Content);

// Bridges a server-initiated MCP elicitation request (which pauses an in-flight tool call inside
// the assistant chat's own McpClient.CreateAsync ElicitationHandler callback) to the separate HTTP
// request the mobile app makes once the human answers the form it rendered from that request's
// SSE frame. One process-wide singleton; a Guid key is the only thing shared between the two
// requests, and the businessId is checked on resolve so one business can't answer another's
// pending elicitation. No background sweeper — the awaiting side removes its own entry when it
// times out or is resolved.
public class ElicitationRegistry
{
    private readonly ConcurrentDictionary<Guid, (Guid BusinessId, TaskCompletionSource<ElicitationAnswer> Tcs)> _pending = new();

    public Guid Register(Guid businessId)
    {
        var id = Guid.NewGuid();
        _pending[id] = (businessId, new TaskCompletionSource<ElicitationAnswer>(TaskCreationOptions.RunContinuationsAsynchronously));
        return id;
    }

    public bool TryResolve(Guid elicitationId, Guid businessId, ElicitationAnswer answer)
    {
        if (!_pending.TryGetValue(elicitationId, out var entry) || entry.BusinessId != businessId)
        {
            return false;
        }

        return entry.Tcs.TrySetResult(answer);
    }

    public async Task<ElicitationAnswer> AwaitAnswerAsync(Guid elicitationId, TimeSpan timeout, CancellationToken cancellationToken)
    {
        if (!_pending.TryGetValue(elicitationId, out var entry))
        {
            throw new InvalidOperationException($"Elicitation {elicitationId} was not registered.");
        }

        try
        {
            return await entry.Tcs.Task.WaitAsync(timeout, cancellationToken);
        }
        catch (TimeoutException)
        {
            return new ElicitationAnswer("cancel", null);
        }
        finally
        {
            _pending.TryRemove(elicitationId, out _);
        }
    }
}
