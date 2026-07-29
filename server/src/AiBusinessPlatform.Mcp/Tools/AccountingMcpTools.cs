using System.ComponentModel;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Auth;
using AiBusinessPlatform.Application.Tools;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Tools;

// The reporting half of the accounting suite — same functions backing GET /api/accounting/cash-up
// and GET /api/accounting/profit-and-loss, exposed here for external AI clients. Gated behind
// Permission.ViewAccounting — see OrderMcpTools' remarks on why MCP tools need their own
// enforcement point distinct from the REST endpoint's RequireAuthorization policy.
[McpServerToolType]
public class AccountingMcpTools(IAccountingTools accountingTools, ICurrentTenantProvider tenantProvider, IPermissionChecker permissionChecker)
{
    [McpServerTool(Name = "get_cash_up"), Description("Gets a day cash-up: for one calendar day (UTC), sales collected and expenses paid broken down by currency and payment method (Cash/EcoCash/Bank/Other), plus the net cash movement for reconciling the till. date defaults to today if omitted (ISO 8601 date, e.g. \"2026-07-27\").")]
    public Task<CashUpResult> GetCashUp(DateOnly? date = null, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ViewAccounting);
        return accountingTools.GetCashUpAsync(tenantProvider.CurrentBusinessId, date, cancellationToken);
    }

    [McpServerTool(Name = "get_profit_and_loss"), Description("Gets a profit & loss summary — revenue (excl. VAT), cost of goods sold, gross profit, expenses, and net profit, broken down by currency — for a time range: \"today\", \"7d\", \"30d\", or \"all\". For an exact custom date range instead, pass from/to (both required together, ISO 8601) — they override range entirely. Cost of goods sold uses each item's most recent purchase cost, not exact FIFO costing.")]
    public Task<ProfitAndLossResult> GetProfitAndLoss(string? range = null, DateTimeOffset? from = null, DateTimeOffset? to = null, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ViewAccounting);
        return accountingTools.GetProfitAndLossAsync(tenantProvider.CurrentBusinessId, range, from, to, cancellationToken);
    }

    [McpServerTool(Name = "get_general_ledger"), Description("Gets the general ledger — raw journal entry lines posted by automated bookkeeping (sales, expenses, purchase receipts, supplier payments), most recent first. Optionally filter to one account by its code (e.g. \"cash\", \"sales_revenue\", \"accounts_payable\", \"inventory\") and/or a date range (from/to, ISO 8601).")]
    public Task<GeneralLedgerResult> GetGeneralLedger(string? accountCode = null, DateTimeOffset? from = null, DateTimeOffset? to = null, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ViewAccounting);
        return accountingTools.GetGeneralLedgerAsync(tenantProvider.CurrentBusinessId, accountCode, from, to, cancellationToken);
    }

    [McpServerTool(Name = "get_trial_balance"), Description("Gets a trial balance — every account's total debits, total credits, and net balance as of a point in time (defaults to now). Total debits should always equal total credits.")]
    public Task<TrialBalanceResult> GetTrialBalance(DateTimeOffset? asOf = null, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ViewAccounting);
        return accountingTools.GetTrialBalanceAsync(tenantProvider.CurrentBusinessId, asOf, cancellationToken);
    }

    [McpServerTool(Name = "get_cash_flow"), Description("Gets a multi-period cash flow view: cash in vs cash out per period, broken down by source (sales, expenses, supplier payments), for a range \"today\"/\"7d\"/\"30d\"/\"all\" or an explicit from/to. The multi-period counterpart to get_cash_up (single day only).")]
    public Task<CashFlowResult> GetCashFlow(string? range = null, DateTimeOffset? from = null, DateTimeOffset? to = null, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ViewAccounting);
        return accountingTools.GetCashFlowAsync(tenantProvider.CurrentBusinessId, range, from, to, cancellationToken);
    }
}
