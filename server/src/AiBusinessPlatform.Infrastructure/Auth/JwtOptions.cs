namespace AiBusinessPlatform.Infrastructure.Auth;

// Section 15 — "Access control ... implemented with ASP.NET Core Identity or an equivalent".
// SigningKey is secret-only (dotnet user-secrets), never in appsettings.json. Shared between the
// Api project (issues tokens) and the Mcp project (validates them) so both trust the exact same
// key/issuer/audience — see HttpBusinessIdTenantProvider below.
public class JwtOptions
{
    public const string SectionName = "Jwt";

    public string SigningKey { get; set; } = string.Empty;
    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public int ExpiryMinutes { get; set; } = 1440;
}
