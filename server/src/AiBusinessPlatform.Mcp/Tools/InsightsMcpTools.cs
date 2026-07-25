using System.ComponentModel;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Tools;

// Section 10.2/10.7 — the same sales-summary function backing GET /api/sales/summary and the
// dashboard Assistant's get_sales_summary tool, exposed here for external AI clients.
[McpServerToolType]
public class InsightsMcpTools(IInsightsTools insightsTools, ICurrentTenantProvider tenantProvider)
{
    // range needs an explicit `= null` default — without one, the MCP SDK's reflection-based
    // schema generation marks it "required", and a caller that omits an optional argument (as
    // models routinely do) gets a hard "missing required parameter" error.
    [McpServerTool(Name = "get_sales_summary"), Description("Gets a sales summary — order count, revenue by currency, daily trend, and top-selling items — for a time range: \"today\", \"7d\", \"30d\", or \"all\". For an exact custom date range instead, pass from/to (both required together, ISO 8601) — they override range entirely.")]
    public Task<SalesInsight> GetSalesSummary(string? range = null, DateTimeOffset? from = null, DateTimeOffset? to = null, CancellationToken cancellationToken = default)
        => insightsTools.GetSalesSummaryAsync(tenantProvider.CurrentBusinessId, range, from, to, cancellationToken);
}
