using System.ComponentModel;

namespace AiBusinessPlatform.Application.Tools;

public record SalesInsightCurrencyTotal(string Currency, int OrderCount, decimal TotalAmount);

public record SalesInsightTrendPoint(DateOnly Date, int OrderCount, decimal TotalAmount);

public record SalesInsightTopItem(Guid CatalogItemId, string Name, int QuantitySold, decimal Revenue);

public record SalesInsight(
    string Range,
    DateTimeOffset? RangeStart,
    int TotalOrders,
    IReadOnlyList<SalesInsightCurrencyTotal> Totals,
    IReadOnlyList<SalesInsightTrendPoint> Trend,
    IReadOnlyList<SalesInsightTopItem> TopItems);

// Section 10.2/10.7 — "same C# function, multiple entry points": this is the one place the
// sales-summary computation lives, called by GET /api/sales/summary, the dashboard Assistant's
// get_sales_summary tool, and the MCP server's equivalent tool, so all three can never drift.
public interface IInsightsTools
{
    [Description("Gets a sales summary — order count, revenue totals by currency, a daily revenue trend, and the top-selling catalog items — for a time range. Valid range values: \"today\", \"7d\", \"30d\", \"all\".")]
    Task<SalesInsight> GetSalesSummaryAsync(Guid businessId, string? range, CancellationToken cancellationToken = default);
}
