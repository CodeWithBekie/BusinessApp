using AiBusinessPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiBusinessPlatform.Infrastructure.Data.Configurations;

public class DocumentChunkConfiguration : IEntityTypeConfiguration<DocumentChunk>
{
    public void Configure(EntityTypeBuilder<DocumentChunk> builder)
    {
        // 768 = text-embedding-nomic-embed-text-v1.5 dimension (confirmed live via LM Studio's
        // /v1/embeddings endpoint) — the embedding model actually in use, not a guess.
        builder.Property(x => x.Embedding).HasColumnType("vector(768)");
        builder.HasIndex(x => x.BusinessId);
        builder.HasIndex(x => x.DocumentId);
    }
}
