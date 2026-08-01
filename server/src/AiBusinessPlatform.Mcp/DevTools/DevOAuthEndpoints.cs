using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using AiBusinessPlatform.Infrastructure.Auth;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AiBusinessPlatform.Mcp.DevTools;

public record DevClientRegistrationRequest(
    [property: JsonPropertyName("redirect_uris")] List<string>? RedirectUris,
    [property: JsonPropertyName("token_endpoint_auth_method")] string? TokenEndpointAuthMethod,
    [property: JsonPropertyName("client_name")] string? ClientName);

// A minimal, dev-only OAuth 2.0 Authorization Code + PKCE flow — just enough for the MCP Inspector
// (a browser-based debugging tool) to obtain a real access token for this server. This host's real
// auth is a plain JWT bearer scheme shared with the Api project (AddPlatformJwtAuthentication) with
// no session/cookie and no OAuth support at all; when a browser client calls it unauthenticated it
// gets a 401 and, per the MCP authorization spec, tries standard OAuth discovery + Dynamic Client
// Registration — which otherwise 404s. This fills exactly that gap, nothing more: /authorize
// auto-approves as the single fixed dev seed owner (no login form — there's no second dev user to
// choose between, and this is only ever mapped in Development). Tokens minted here are byte-for-byte
// the same shape `POST /api/auth/login` issues (BusinessJwtTokenFactory), so an MCP call made this
// way authenticates identically to any other.
public static class DevOAuthEndpoints
{
    public static void MapDevOAuthEndpoints(this WebApplication app)
    {
        app.MapGet("/.well-known/oauth-authorization-server", (HttpContext context) => Results.Json(AuthorizationServerMetadata(context)))
            .AllowAnonymous();

        // Alias: the Inspector's discovery probes both paths.
        app.MapGet("/.well-known/openid-configuration", (HttpContext context) => Results.Json(AuthorizationServerMetadata(context)))
            .AllowAnonymous();

        app.MapGet("/.well-known/oauth-protected-resource", (HttpContext context) =>
        {
            var baseUrl = BaseUrl(context);
            return Results.Json(new { resource = baseUrl, authorization_servers = new[] { baseUrl } });
        }).AllowAnonymous();

        app.MapPost("/register", (DevClientRegistrationRequest request, DevOAuthStateStore store) =>
        {
            if (request.RedirectUris is null || request.RedirectUris.Count == 0)
            {
                return Results.BadRequest(new { error = "invalid_client_metadata", error_description = "redirect_uris is required." });
            }

            var client = store.RegisterClient(request.RedirectUris);
            return Results.Json(new
            {
                client_id = client.ClientId,
                redirect_uris = client.RedirectUris,
                token_endpoint_auth_method = "none",
                grant_types = new[] { "authorization_code" },
                response_types = new[] { "code" }
            }, statusCode: StatusCodes.Status201Created);
        }).AllowAnonymous();

        app.MapGet("/authorize", (HttpContext context, DevOAuthStateStore store) =>
        {
            var query = context.Request.Query;
            var clientId = query["client_id"].ToString();
            var redirectUri = query["redirect_uri"].ToString();
            var codeChallenge = query["code_challenge"].ToString();
            var codeChallengeMethod = query["code_challenge_method"].ToString();
            var state = query["state"].ToString();

            if (!store.TryGetClient(clientId, out var client) || !client.RedirectUris.Contains(redirectUri))
            {
                return Results.BadRequest(new { error = "invalid_request", error_description = "Unknown client_id or redirect_uri." });
            }
            if (string.IsNullOrEmpty(codeChallenge) || !string.Equals(codeChallengeMethod, "S256", StringComparison.Ordinal))
            {
                return Results.BadRequest(new { error = "invalid_request", error_description = "code_challenge with method S256 is required." });
            }

            // No login screen: auto-approved as the fixed dev seed owner (see file remarks).
            var code = store.IssueCode(clientId, redirectUri, codeChallenge);
            var separator = redirectUri.Contains('?') ? '&' : '?';
            var location = $"{redirectUri}{separator}code={Uri.EscapeDataString(code)}&state={Uri.EscapeDataString(state)}";
            return Results.Redirect(location);
        }).AllowAnonymous();

        app.MapPost("/token", async (HttpContext context, DevOAuthStateStore store, AiBusinessPlatformDbContext db, IOptions<JwtOptions> jwtOptions) =>
        {
            var form = await context.Request.ReadFormAsync();
            var grantType = form["grant_type"].ToString();
            var code = form["code"].ToString();
            var redirectUri = form["redirect_uri"].ToString();
            var clientId = form["client_id"].ToString();
            var codeVerifier = form["code_verifier"].ToString();

            if (grantType != "authorization_code")
            {
                return Results.BadRequest(new { error = "unsupported_grant_type" });
            }
            if (!store.TryConsumeCode(code, out var authorizationCode))
            {
                return Results.BadRequest(new { error = "invalid_grant", error_description = "Unknown, expired, or already-used code." });
            }
            if (authorizationCode.ClientId != clientId || authorizationCode.RedirectUri != redirectUri)
            {
                return Results.BadRequest(new { error = "invalid_grant", error_description = "client_id/redirect_uri mismatch." });
            }
            if (!VerifyPkce(codeVerifier, authorizationCode.CodeChallenge))
            {
                return Results.BadRequest(new { error = "invalid_grant", error_description = "code_verifier does not match code_challenge." });
            }

            var owner = await db.BusinessUsers.IgnoreQueryFilters().FirstAsync(u => u.Id == DevSeedData.DevBusinessUserId);
            var accessToken = BusinessJwtTokenFactory.CreateAccessToken(owner, jwtOptions.Value);

            return Results.Json(new
            {
                access_token = accessToken,
                token_type = "Bearer",
                expires_in = jwtOptions.Value.ExpiryMinutes * 60
            });
        }).AllowAnonymous();
    }

    private static string BaseUrl(HttpContext context) => $"{context.Request.Scheme}://{context.Request.Host}";

    private static object AuthorizationServerMetadata(HttpContext context)
    {
        var baseUrl = BaseUrl(context);
        return new
        {
            issuer = baseUrl,
            authorization_endpoint = $"{baseUrl}/authorize",
            token_endpoint = $"{baseUrl}/token",
            registration_endpoint = $"{baseUrl}/register",
            response_types_supported = new[] { "code" },
            grant_types_supported = new[] { "authorization_code" },
            code_challenge_methods_supported = new[] { "S256" },
            token_endpoint_auth_methods_supported = new[] { "none" }
        };
    }

    private static bool VerifyPkce(string codeVerifier, string codeChallenge)
    {
        if (string.IsNullOrEmpty(codeVerifier))
        {
            return false;
        }

        var hash = SHA256.HashData(Encoding.ASCII.GetBytes(codeVerifier));
        var computedChallenge = Convert.ToBase64String(hash).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        return computedChallenge == codeChallenge;
    }
}
