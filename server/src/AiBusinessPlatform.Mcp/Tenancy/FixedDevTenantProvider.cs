using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Infrastructure.Data;

namespace AiBusinessPlatform.Mcp.Tenancy;

// Dev-only stand-in for Section 14's real mechanism: an external MCP client should authenticate
// via its own McpIntegrationAccount credential, which resolves to a specific business_id. Phase 0
// has no auth yet, so every call is scoped to the seeded dev business.
public class FixedDevTenantProvider : ICurrentTenantProvider
{
    public Guid CurrentBusinessId => DevSeedData.DevBusinessId;
}
