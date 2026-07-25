using AiBusinessPlatform.Application.Abstractions;
using Microsoft.AspNetCore.Http;

namespace AiBusinessPlatform.Infrastructure.Auth;

// Reads customer_account_id off the authenticated JWT — issued only by CustomerAuthEndpoints, and
// never present on a business-owner token (see AuthEndpoints.IssueToken), so this returns null for
// every business/anonymous caller rather than throwing (unlike HttpBusinessIdTenantProvider's
// CurrentBusinessId, "no customer" is an expected, legitimate state here).
public class HttpCustomerAccountProvider(IHttpContextAccessor httpContextAccessor) : ICurrentCustomerProvider
{
    public Guid? CurrentCustomerAccountId
    {
        get
        {
            var claim = httpContextAccessor.HttpContext?.User.FindFirst("customer_account_id")?.Value;
            return Guid.TryParse(claim, out var customerAccountId) ? customerAccountId : null;
        }
    }
}
