using System.ComponentModel;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Tools;

// Section 10.6/10.7 — the same RAG retrieval the WhatsApp orchestrator and dashboard Assistant use,
// exposed for external AI clients. Read-only (never mutates documents — ingestion stays
// dashboard-only, same as the other two entry points).
[McpServerToolType]
public class RagMcpTools(IRagTools ragTools, ICurrentTenantProvider tenantProvider)
{
    [McpServerTool(Name = "search_business_documents"), Description("Searches this business's own uploaded documents (policies, FAQs, notes) for content relevant to a free-text question, ranked by relevance.")]
    public Task<IReadOnlyList<RetrievedDocumentChunk>> SearchBusinessDocuments(string query, CancellationToken cancellationToken)
        => ragTools.RetrieveRelevantDocumentsAsync(tenantProvider.CurrentBusinessId, query, cancellationToken);
}
