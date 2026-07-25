using AiBusinessPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiBusinessPlatform.Infrastructure.Data.Configurations;

public class CustomerConfiguration : IEntityTypeConfiguration<Customer>
{
    public void Configure(EntityTypeBuilder<Customer> builder)
    {
        builder.HasIndex(x => new { x.BusinessId, x.WhatsAppNumber }).IsUnique();
        builder.HasOne<Business>().WithMany().HasForeignKey(x => x.BusinessId).OnDelete(DeleteBehavior.Restrict);

        // Not unique — a business could theoretically end up with more than one Customer row
        // linked to the same marketplace account (e.g. a later real-WhatsApp merge), and that's
        // an acceptable state, not a constraint violation.
        builder.HasOne<CustomerAccount>().WithMany().HasForeignKey(x => x.CustomerAccountId).OnDelete(DeleteBehavior.SetNull);
        builder.HasIndex(x => x.CustomerAccountId);
    }
}
