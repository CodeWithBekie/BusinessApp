using AiBusinessPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiBusinessPlatform.Infrastructure.Data.Configurations;

public class PaymentConfiguration : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> builder)
    {
        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.Property(x => x.AmountTendered).HasPrecision(18, 2);
        builder.HasIndex(x => x.BusinessId);
        // Idempotency on webhook redelivery (Section 9.3) — a provider reference is only ever recorded once.
        builder.HasIndex(x => x.ProviderReference).IsUnique();
        // Order-to-cash lookups: "find this order's pending payment".
        builder.HasIndex(x => new { x.OrderId, x.Status });

        builder.HasOne<Business>().WithMany().HasForeignKey(x => x.BusinessId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Order>().WithMany().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Restrict);
    }
}
