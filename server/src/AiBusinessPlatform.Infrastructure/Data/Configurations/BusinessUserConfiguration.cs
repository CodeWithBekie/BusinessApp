using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiBusinessPlatform.Infrastructure.Data.Configurations;

public class BusinessUserConfiguration : IEntityTypeConfiguration<BusinessUser>
{
    public void Configure(EntityTypeBuilder<BusinessUser> builder)
    {
        builder.HasIndex(x => new { x.BusinessId, x.Email }).IsUnique();

        // Note: HasQueryFilter (applied globally in DbContext.OnModelCreating for ITenantScoped entities)
        // does not affect HasData seeding — the row is inserted by the migration regardless.
        builder.HasData(new BusinessUser
        {
            Id = DevSeedData.DevBusinessUserId,
            BusinessId = DevSeedData.DevBusinessId,
            Name = "Dev Owner",
            Email = "owner@dev.local",
            Role = BusinessUserRole.Owner,
            CreatedAt = DevSeedData.SeedTimestamp
        });
    }
}
