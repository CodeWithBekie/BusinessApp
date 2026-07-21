using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiBusinessPlatform.Infrastructure.Data.Configurations;

public class BusinessConfiguration : IEntityTypeConfiguration<Business>
{
    public void Configure(EntityTypeBuilder<Business> builder)
    {
        // Phase 0 dev seed so scaffolded endpoints have a real tenant to read/write against.
        builder.HasData(new Business
        {
            Id = DevSeedData.DevBusinessId,
            Name = "Dev Business",
            IndustryType = "hardware",
            Currency = "USD",
            Timezone = "Africa/Harare",
            Status = BusinessStatus.Active,
            CreatedAt = DevSeedData.SeedTimestamp
        });
    }
}
