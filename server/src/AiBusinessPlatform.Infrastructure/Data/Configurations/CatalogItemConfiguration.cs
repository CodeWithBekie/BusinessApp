using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiBusinessPlatform.Infrastructure.Data.Configurations;

public class CatalogItemConfiguration : IEntityTypeConfiguration<CatalogItem>
{
    public void Configure(EntityTypeBuilder<CatalogItem> builder)
    {
        builder.Property(x => x.Price).HasPrecision(18, 2);
        builder.Property(x => x.Cost).HasPrecision(18, 2);
        builder.HasIndex(x => x.BusinessId);
        builder.HasOne<Business>().WithMany().HasForeignKey(x => x.BusinessId).OnDelete(DeleteBehavior.Restrict);

        // Dev seed so the orchestrator harness (and other Phase 0 endpoints) have real catalog
        // data to query against — a hardware-store example, matching the spec's Section 3 pilot.
        builder.HasData(
            new CatalogItem
            {
                Id = DevSeedData.DevCatalogItemCementId,
                BusinessId = DevSeedData.DevBusinessId,
                Name = "Cement (50kg bag)",
                ItemType = CatalogItemType.Stock,
                Price = 12.50m,
                Currency = "USD",
                StockQuantity = 120,
                Unit = "bag",
                Active = true,
                CreatedAt = DevSeedData.SeedTimestamp,
                UpdatedAt = DevSeedData.SeedTimestamp
            },
            new CatalogItem
            {
                Id = DevSeedData.DevCatalogItemHammerId,
                BusinessId = DevSeedData.DevBusinessId,
                Name = "Claw Hammer",
                ItemType = CatalogItemType.Stock,
                Price = 8.00m,
                Currency = "USD",
                StockQuantity = 35,
                Unit = "each",
                Active = true,
                CreatedAt = DevSeedData.SeedTimestamp,
                UpdatedAt = DevSeedData.SeedTimestamp
            },
            new CatalogItem
            {
                Id = DevSeedData.DevCatalogItemPaintId,
                BusinessId = DevSeedData.DevBusinessId,
                Name = "Exterior Paint (5L)",
                ItemType = CatalogItemType.Stock,
                Price = 22.00m,
                Currency = "USD",
                StockQuantity = 40,
                Unit = "can",
                Active = true,
                CreatedAt = DevSeedData.SeedTimestamp,
                UpdatedAt = DevSeedData.SeedTimestamp
            });
    }
}
