using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiBusinessPlatform.Infrastructure.Data.Configurations;

public class BusinessUserConfiguration : IEntityTypeConfiguration<BusinessUser>
{
    public void Configure(EntityTypeBuilder<BusinessUser> builder)
    {
        // Global, not per-business: login must resolve a single account from an email address
        // before any tenant is known, so email is one-account-per-platform, not per-business.
        builder.HasIndex(x => x.Email).IsUnique();

        builder.HasOne<Business>().WithMany().HasForeignKey(x => x.BusinessId).OnDelete(DeleteBehavior.Restrict);

        // Note: HasQueryFilter (applied globally in DbContext.OnModelCreating for ITenantScoped entities)
        // does not affect HasData seeding — the row is inserted by the migration regardless.
        // PasswordHash is a precomputed PasswordHasher<BusinessUser> hash for "DevPassword123!" —
        // login via POST /api/auth/login with owner@dev.local / DevPassword123! for local testing.
        builder.HasData(new BusinessUser
        {
            Id = DevSeedData.DevBusinessUserId,
            BusinessId = DevSeedData.DevBusinessId,
            Name = "Dev Owner",
            Email = "owner@dev.local",
            PasswordHash = "AQAAAAIAAYagAAAAEJm2hE9zbCsWS3kVTQSYot1knZTUeXR80NsqS/ov62epokuTJwITOS89BiakmsBMeQ==",
            Role = BusinessUserRole.Owner,
            CreatedAt = DevSeedData.SeedTimestamp
        });
    }
}
