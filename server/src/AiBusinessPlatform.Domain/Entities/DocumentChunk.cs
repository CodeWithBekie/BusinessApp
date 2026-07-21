using Pgvector;

namespace AiBusinessPlatform.Domain.Entities;

// Section 10.6 — chunked + embedded content for RAG retrieval, with citation metadata.
public class DocumentChunk : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; } // denormalized for tenant-scoped query filter (Section 11)
    public Guid DocumentId { get; set; }
    public string Content { get; set; } = string.Empty;

    // Placeholder dimension (1536 = OpenAI text-embedding-3-small) until Section 10/23 finalizes the embedding provider.
    public Vector? Embedding { get; set; }
    public int ChunkIndex { get; set; }
    public string? SectionLabel { get; set; }
}
