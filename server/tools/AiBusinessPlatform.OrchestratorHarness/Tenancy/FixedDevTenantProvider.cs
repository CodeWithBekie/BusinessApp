using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Infrastructure.Data;

namespace AiBusinessPlatform.OrchestratorHarness.Tenancy;

// Dev-only stand-in — this harness always operates as the seeded dev business (Section 10.1's
// console harness is a local dev tool, not a multi-tenant entry point).
public class FixedDevTenantProvider : ICurrentTenantProvider
{
    public Guid CurrentBusinessId => DevSeedData.DevBusinessId;
}
