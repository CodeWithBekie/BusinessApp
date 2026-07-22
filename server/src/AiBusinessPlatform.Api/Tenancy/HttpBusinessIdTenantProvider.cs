using AiBusinessPlatform.Application.Abstractions;

namespace AiBusinessPlatform.Api.Tenancy;

// Resolves business_id from the authenticated JWT's business_id claim (Section 14/15) — issued at
// login/signup by AuthEndpoints. Also implements ICurrentTenantSetter so a background consumer (no
// HttpContext) can push a business_id resolved elsewhere (e.g. WhatsApp webhook ingress, Section
// 9.3) into this same scoped instance — see Program.cs's forwarding registration for why this must
// stay a single instance per scope rather than two independent registrations.
public class HttpBusinessIdTenantProvider(IHttpContextAccessor httpContextAccessor) : ICurrentTenantProvider, ICurrentTenantSetter
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
                // Should be unreachable once every /api/* route requires authorization — a
                // missing/invalid claim here means an endpoint forgot to require auth, not a
                // legitimate no-tenant case.
                throw new InvalidOperationException("No business_id claim on the current principal.");
            }

            return businessId;
        }
    }

    public void SetBusinessId(Guid businessId) => _explicitBusinessId = businessId;
}
