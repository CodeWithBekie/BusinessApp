using AiBusinessPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiBusinessPlatform.Infrastructure.Data.Configurations;

public class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.Property(x => x.TotalAmount).HasPrecision(18, 2);
        builder.HasIndex(x => x.BusinessId);
        builder.HasIndex(x => new { x.BusinessId, x.Status });
        // Order-to-cash lookups: "find the customer's current open (Quoted) order".
        builder.HasIndex(x => new { x.CustomerId, x.Status });
    }
}
