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
    [McpServerTool(Name = "get_sales_summary"), Description("Gets a sales summary — order count, revenue by currency, daily trend, and top-selling items — for a time range: \"today\", \"7d\", \"30d\", or \"all\".")]
    public Task<SalesInsight> GetSalesSummary(string? range, CancellationToken cancellationToken)
        => insightsTools.GetSalesSummaryAsync(tenantProvider.CurrentBusinessId, range, cancellationToken);
}
