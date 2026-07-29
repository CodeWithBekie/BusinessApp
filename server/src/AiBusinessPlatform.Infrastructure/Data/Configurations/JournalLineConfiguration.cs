using AiBusinessPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiBusinessPlatform.Infrastructure.Data.Configurations;

public class JournalLineConfiguration : IEntityTypeConfiguration<JournalLine>
{
    public void Configure(EntityTypeBuilder<JournalLine> builder)
    {
        builder.Property(x => x.Debit).HasPrecision(18, 2);
        builder.Property(x => x.Credit).HasPrecision(18, 2);
        builder.HasIndex(x => x.BusinessId);
        builder.HasIndex(x => x.JournalEntryId);
        builder.HasIndex(x => new { x.BusinessId, x.AccountId });

        builder.HasOne<Business>().WithMany().HasForeignKey(x => x.BusinessId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<JournalEntry>().WithMany().HasForeignKey(x => x.JournalEntryId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Account>().WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
    }
}
