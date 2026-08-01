using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AiBusinessPlatform.Domain.Entities;
using Microsoft.IdentityModel.Tokens;

namespace AiBusinessPlatform.Infrastructure.Auth;

// Extracted from the Api project's AuthEndpoints.IssueToken so a second caller (the Mcp project's
// dev-only OAuth shim, which mints the same shape of token for the MCP Inspector) can't drift from
// the real login endpoint's claim shape — a mismatch here would silently break
// HttpBusinessIdTenantProvider's claim lookups.
public static class BusinessJwtTokenFactory
{
    public static string CreateAccessToken(BusinessUser user, JwtOptions options)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim("business_id", user.BusinessId.ToString()),
            new Claim(ClaimTypes.Role, user.Role.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email)
        };

        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.SigningKey));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: options.Issuer,
            audience: options.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(options.ExpiryMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
