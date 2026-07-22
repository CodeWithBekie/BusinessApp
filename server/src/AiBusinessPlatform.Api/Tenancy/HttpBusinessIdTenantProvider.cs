using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Infrastructure.Data;

namespace AiBusinessPlatform.Api.Tenancy;

// Dev-only tenant resolution: reads the X-Business-Id header, defaulting to the seeded dev
// business when absent. Replaced by real JWT-claim-based resolution once auth exists (Section 14).
// Also implements ICurrentTenantSetter so a background consumer (no HttpContext) can push a
// business_id resolved elsewhere (e.g. at webhook ingress, Section 9.3) into this same scoped
// instance — see Program.cs's forwarding registration for why this must stay a single instance
// per scope rather than two independent registrations.
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

            var header = httpContextAccessor.HttpContext?.Request.Headers["X-Business-Id"].FirstOrDefault();
            return Guid.TryParse(header, out var parsed) ? parsed : DevSeedData.DevBusinessId;
        }
    }

    public void SetBusinessId(Guid businessId) => _explicitBusinessId = businessId;
}
