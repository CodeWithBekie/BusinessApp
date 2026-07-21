using AiBusinessPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiBusinessPlatform.Infrastructure.Data.Configurations;

public class DocumentChunkConfiguration : IEntityTypeConfiguration<DocumentChunk>
{
    public void Configure(EntityTypeBuilder<DocumentChunk> builder)
    {
        // 1536 = OpenAI text-embedding-3-small dimension, a placeholder until Section 10/23 finalizes
        // the embedding provider — revisit this column type when that decision is made.
        builder.Property(x => x.Embedding).HasColumnType("vector(1536)");
        builder.HasIndex(x => x.BusinessId);
        builder.HasIndex(x => x.DocumentId);
    }
}
