namespace AiBusinessPlatform.Api.Contracts;

public record SalesCurrencyTotal(string Currency, int OrderCount, decimal TotalAmount);

public record SalesTrendPoint(DateOnly Date, int OrderCount, decimal TotalAmount);

public record SalesTopItem(Guid CatalogItemId, string Name, int QuantitySold, decimal Revenue);

public record SalesSummaryResponse(
    string Range,
    DateTimeOffset? RangeStart,
    int TotalOrders,
    IReadOnlyList<SalesCurrencyTotal> Totals,
    IReadOnlyList<SalesTrendPoint> Trend,
    IReadOnlyList<SalesTopItem> TopItems);
