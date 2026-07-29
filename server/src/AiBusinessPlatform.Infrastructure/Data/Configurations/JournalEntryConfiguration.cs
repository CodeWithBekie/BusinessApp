using AiBusinessPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiBusinessPlatform.Infrastructure.Data.Configurations;

public class JournalEntryConfiguration : IEntityTypeConfiguration<JournalEntry>
{
    public void Configure(EntityTypeBuilder<JournalEntry> builder)
    {
        builder.HasIndex(x => x.BusinessId);
        builder.HasIndex(x => new { x.BusinessId, x.PostedAt });
        builder.HasIndex(x => new { x.BusinessId, x.SourceType, x.SourceId });

        builder.HasOne<Business>().WithMany().HasForeignKey(x => x.BusinessId).OnDelete(DeleteBehavior.Restrict);
    }
}
