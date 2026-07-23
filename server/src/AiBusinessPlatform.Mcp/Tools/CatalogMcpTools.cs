using System.ComponentModel;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Tools;

// Section 10.7 UC7's own example ("check stock for cement at Joe's Hardware") — the same
// ICatalogTools.CheckAvailabilityAsync the WhatsApp orchestrator calls, exposed here for external
// AI clients. Read-only: deliberately the only Catalog capability exposed via MCP this pass — see
// the scope note on OrderMcpTools for why reserve/release/create-invoice aren't exposed yet.
[McpServerToolType]
public class CatalogMcpTools(ICatalogTools catalogTools, ICurrentTenantProvider tenantProvider)
{
    [McpServerTool(Name = "check_catalog_availability"), Description("Finds catalog items matching a free-text query and returns price/stock availability.")]
    public Task<IReadOnlyList<CatalogAvailabilityMatch>> CheckAvailability(string itemQuery, CancellationToken cancellationToken)
        => catalogTools.CheckAvailabilityAsync(tenantProvider.CurrentBusinessId, itemQuery, cancellationToken);
}
