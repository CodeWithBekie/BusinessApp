using System.ComponentModel;
using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Tools;

public record CashUpProviderTotal(PaymentProvider Provider, int Count, decimal TotalAmount);

public record CashUpCurrencyGroup(
    string Currency, IReadOnlyList<CashUpProviderTotal> SalesByProvider, IReadOnlyList<CashUpProviderTotal> ExpensesByProvider,
    decimal NetCashMovement);

public record CashUpResult(DateOnly Date, IReadOnlyList<CashUpCurrencyGroup> Currencies);

public record ProfitAndLossCurrencyBreakdown(
    string Currency, decimal Revenue, decimal CostOfGoodsSold, decimal GrossProfit, decimal Expenses, decimal NetProfit);

public record ProfitAndLossResult(
    string Range, DateTimeOffset? RangeStart, DateTimeOffset? RangeEnd, IReadOnlyList<ProfitAndLossCurrencyBreakdown> Currencies);

// New ground, not a spec section — the reporting half of the accounting suite (the other half is
// IExpenseTools). Shared by the dashboard REST endpoints and the MCP/Assistant tools (Section
// 10.2/10.7's "one function, multiple entry points"), same as IInsightsTools.GetSalesSummaryAsync.
public interface IAccountingTools
{
    // NetCashMovement = Cash sales collected minus Cash expenses paid, for that currency, on that
    // one day — the actual till-reconciliation figure a cashier/owner checks at close of business.
    [Description("Gets a day cash-up: for one calendar day (UTC), sales collected and expenses paid broken down by currency and payment method (Cash/EcoCash/Bank/Other), plus the net cash movement for reconciling the till. Defaults to today if date is omitted (ISO 8601 date, e.g. \"2026-07-27\").")]
    Task<CashUpResult> GetCashUpAsync(Guid businessId, DateOnly? date = null, CancellationToken cancellationToken = default);

    // COGS uses each item's most recent purchase cost (CatalogItem.Cost, set at receive time) —
    // not true FIFO/weighted-average costing. Revenue is VAT-exclusive (VAT collected isn't income).
    [Description("Gets a profit & loss summary — revenue (excl. VAT), cost of goods sold, gross profit, expenses, and net profit, broken down by currency — for a time range: \"today\", \"7d\", \"30d\", or \"all\". For an exact custom date range instead, pass from/to (both required together, ISO 8601) — they override range entirely. Cost of goods sold uses each item's most recent purchase cost, not exact FIFO costing.")]
    Task<ProfitAndLossResult> GetProfitAndLossAsync(Guid businessId, string? range = null, DateTimeOffset? from = null, DateTimeOffset? to = null, CancellationToken cancellationToken = default);
}
