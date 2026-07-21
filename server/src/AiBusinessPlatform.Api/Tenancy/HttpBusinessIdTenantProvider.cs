using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Infrastructure.Data;

namespace AiBusinessPlatform.Api.Tenancy;

// Dev-only tenant resolution: reads the X-Business-Id header, defaulting to the seeded dev
// business when absent. Replaced by real JWT-claim-based resolution once auth exists (Section 14).
public class HttpBusinessIdTenantProvider : ICurrentTenantProvider
{
    public Guid CurrentBusinessId { get; }

    public HttpBusinessIdTenantProvider(IHttpContextAccessor httpContextAccessor)
    {
        var header = httpContextAccessor.HttpContext?.Request.Headers["X-Business-Id"].FirstOrDefault();
        CurrentBusinessId = Guid.TryParse(header, out var parsed) ? parsed : DevSeedData.DevBusinessId;
    }
}
