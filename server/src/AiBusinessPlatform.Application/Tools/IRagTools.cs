using System.ComponentModel;

namespace AiBusinessPlatform.Application.Tools;

public record RetrievedDocumentChunk(Guid DocumentId, string DocumentTitle, string? SectionLabel, string Content, float Score);

public record IngestDocumentResult(Guid DocumentId, int ChunkCount);

// Section 10.6 — RAG retrieval, always filtered by business_id at the query level (structural,
// via the DbContext's global tenant query filter on Document/DocumentChunk).
public interface IRagTools
{
    [Description("Retrieves the most relevant document chunks for a business, ranked by similarity, for grounding a RAG answer with citations.")]
    Task<IReadOnlyList<RetrievedDocumentChunk>> RetrieveRelevantDocumentsAsync(Guid businessId, string query, CancellationToken cancellationToken = default);

    // Not AI-facing — dashboard-only document upload, same convention as
    // IApprovalTools.DecideApprovalAsync (kept safe purely by never being added to ChatOptions.Tools).
    Task<IngestDocumentResult> IngestDocumentAsync(Guid businessId, string title, string sourceType, string content, CancellationToken cancellationToken = default);
}
