namespace AiBusinessPlatform.Infrastructure.Data;

// Fixed IDs so `HasData` seeding is deterministic across migrations, and so the dev-only
// X-Business-Id header (Api middleware) has a real tenant to default to.
public static class DevSeedData
{
    public static readonly Guid DevBusinessId = Guid.Parse("00000000-0000-0000-0000-000000000001");
    public static readonly Guid DevBusinessUserId = Guid.Parse("00000000-0000-0000-0000-000000000002");
    public static readonly Guid DevCatalogItemCementId = Guid.Parse("00000000-0000-0000-0000-000000000003");
    public static readonly Guid DevCatalogItemHammerId = Guid.Parse("00000000-0000-0000-0000-000000000004");
    public static readonly Guid DevCatalogItemPaintId = Guid.Parse("00000000-0000-0000-0000-000000000005");
    public static readonly DateTimeOffset SeedTimestamp = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
}
