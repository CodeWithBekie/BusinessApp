using System.ComponentModel;

namespace AiBusinessPlatform.Application.Tools;

public record RetrievedDocumentChunk(Guid DocumentId, string DocumentTitle, string? SectionLabel, string Content, float Score);

// Section 10.6 — RAG retrieval, always filtered by business_id at the query level. The Phase 0
// contract exists so Api/Mcp can wire an endpoint shape now; embedding + retrieval logic is Phase 2.
public interface IRagTools
{
    [Description("Retrieves the most relevant document chunks for a business, ranked by similarity, for grounding a RAG answer with citations.")]
    Task<IReadOnlyList<RetrievedDocumentChunk>> RetrieveRelevantDocumentsAsync(Guid businessId, string query, CancellationToken cancellationToken = default);
}
