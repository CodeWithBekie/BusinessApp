using AiBusinessPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiBusinessPlatform.Infrastructure.Data.Configurations;

public class PaymentConfiguration : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> builder)
    {
        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.HasIndex(x => x.BusinessId);
        // Idempotency on webhook redelivery (Section 9.3) — a provider reference is only ever recorded once.
        builder.HasIndex(x => x.ProviderReference).IsUnique();
    }
}
