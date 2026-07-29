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

public record GeneralLedgerLine(
    Guid JournalEntryId, DateTimeOffset PostedAt, string Description, string SourceType, string SourceId,
    string AccountCode, string AccountName, decimal Debit, decimal Credit);

public record GeneralLedgerResult(string? AccountCode, DateTimeOffset? From, DateTimeOffset? To, IReadOnlyList<GeneralLedgerLine> Lines);

public record TrialBalanceRow(string AccountCode, string AccountName, AccountType AccountType, decimal TotalDebit, decimal TotalCredit, decimal Balance);

public record TrialBalanceResult(DateTimeOffset AsOf, IReadOnlyList<TrialBalanceRow> Rows, decimal TotalDebits, decimal TotalCredits);

public record CashFlowBucket(DateOnly PeriodStart, decimal CashIn, decimal CashOut, decimal NetChange);

public record CashFlowBreakdownItem(string SourceType, decimal Amount);

public record CashFlowCurrencyGroup(
    string Currency, IReadOnlyList<CashFlowBucket> Buckets, IReadOnlyList<CashFlowBreakdownItem> InflowBreakdown,
    IReadOnlyList<CashFlowBreakdownItem> OutflowBreakdown, decimal NetCashFlow);

public record CashFlowResult(string Range, DateTimeOffset? RangeStart, DateTimeOffset? RangeEnd, IReadOnlyList<CashFlowCurrencyGroup> Currencies);

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

    [Description("Gets the general ledger — raw journal entry lines posted by automated bookkeeping (sales, expenses, purchase receipts, supplier payments), most recent first. Optionally filter to one account by its code (e.g. \"cash\", \"sales_revenue\", \"accounts_payable\", \"inventory\") and/or a date range (from/to, ISO 8601, both optional and independent).")]
    Task<GeneralLedgerResult> GetGeneralLedgerAsync(Guid businessId, string? accountCode = null, DateTimeOffset? from = null, DateTimeOffset? to = null, CancellationToken cancellationToken = default);

    [Description("Gets a trial balance — every account's total debits, total credits, and net balance as of a point in time (defaults to now). Total debits should always equal total credits — the classic bookkeeping cross-check.")]
    Task<TrialBalanceResult> GetTrialBalanceAsync(Guid businessId, DateTimeOffset? asOf = null, CancellationToken cancellationToken = default);

    [Description("Gets a multi-period cash flow view — cash in vs cash out per period, broken down by source (sales, expenses, supplier payments), for a time range: \"today\", \"7d\", \"30d\", or \"all\". For an exact custom date range instead, pass from/to (both required together, ISO 8601). The multi-period counterpart to get_cash_up, which is single-day only.")]
    Task<CashFlowResult> GetCashFlowAsync(Guid businessId, string? range = null, DateTimeOffset? from = null, DateTimeOffset? to = null, CancellationToken cancellationToken = default);
}
