using System.Security.Claims;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Domain;
using Microsoft.AspNetCore.Http;

namespace AiBusinessPlatform.Infrastructure.Auth;

// Resolves business_id/user_id from the authenticated JWT (Section 14/15) — issued at login/signup
// by the Api project's AuthEndpoints, validated identically by both the Api and Mcp projects (same
// JwtOptions). Also implements ICurrentTenantSetter so a background consumer (no HttpContext) can
// push a business_id resolved elsewhere (e.g. WhatsApp webhook ingress, Section 9.3) into this same
// scoped instance — register ONE scoped instance forwarded to all three interfaces, never separate
// registrations, or a background consumer's SetBusinessId call would land on a different instance
// than the one CurrentBusinessId is later read from.
public class HttpBusinessIdTenantProvider(IHttpContextAccessor httpContextAccessor)
    : ICurrentTenantProvider, ICurrentTenantSetter, ICurrentUserProvider, ICurrentUserRoleProvider
{
    private Guid? _explicitBusinessId;

    public Guid CurrentBusinessId
    {
        get
        {
            if (_explicitBusinessId is { } explicitId)
            {
                return explicitId;
            }

            var claim = httpContextAccessor.HttpContext?.User.FindFirst("business_id")?.Value;
            if (!Guid.TryParse(claim, out var businessId))
            {
                // Should be unreachable once every route requires authorization — a
                // missing/invalid claim here means an endpoint forgot to require auth, not a
                // legitimate no-tenant case.
                throw new InvalidOperationException("No business_id claim on the current principal.");
            }

            return businessId;
        }
    }

    public Guid? CurrentUserId
    {
        get
        {
            var claim = httpContextAccessor.HttpContext?.User.FindFirst("sub")?.Value;
            return Guid.TryParse(claim, out var userId) ? userId : null;
        }
    }

    public BusinessUserRole? CurrentUserRole
    {
        get
        {
            var claim = httpContextAccessor.HttpContext?.User.FindFirst(ClaimTypes.Role)?.Value;
            return Enum.TryParse<BusinessUserRole>(claim, out var role) ? role : null;
        }
    }

    public void SetBusinessId(Guid businessId) => _explicitBusinessId = businessId;
}
