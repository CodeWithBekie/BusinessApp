using System.Collections.Concurrent;

namespace AiBusinessPlatform.Mcp.DevTools;

public sealed record DevOAuthClient(string ClientId, IReadOnlyList<string> RedirectUris);

public sealed record DevOAuthAuthorizationCode(string ClientId, string RedirectUri, string CodeChallenge, DateTimeOffset ExpiresAt);

// Process-lifetime, in-memory only — this is throwaway state backing the dev-only OAuth shim
// (DevOAuthEndpoints) that lets the MCP Inspector connect. Never persisted, never touches the
// database, and only ever registered when ASPNETCORE_ENVIRONMENT is Development.
public sealed class DevOAuthStateStore
{
    private readonly ConcurrentDictionary<string, DevOAuthClient> _clients = new();
    private readonly ConcurrentDictionary<string, DevOAuthAuthorizationCode> _codes = new();

    public DevOAuthClient RegisterClient(IReadOnlyList<string> redirectUris)
    {
        var client = new DevOAuthClient(Guid.NewGuid().ToString("N"), redirectUris);
        _clients[client.ClientId] = client;
        return client;
    }

    public bool TryGetClient(string clientId, out DevOAuthClient client) => _clients.TryGetValue(clientId, out client!);

    public string IssueCode(string clientId, string redirectUri, string codeChallenge)
    {
        var code = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        _codes[code] = new DevOAuthAuthorizationCode(clientId, redirectUri, codeChallenge, DateTimeOffset.UtcNow.AddMinutes(2));
        return code;
    }

    // Single-use: removed on first lookup regardless of whether it turns out to be expired.
    public bool TryConsumeCode(string code, out DevOAuthAuthorizationCode authorizationCode)
    {
        if (_codes.TryRemove(code, out var found) && found.ExpiresAt > DateTimeOffset.UtcNow)
        {
            authorizationCode = found;
            return true;
        }

        authorizationCode = null!;
        return false;
    }
}
