using System.ComponentModel;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Auth;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Tools;

// The same IExpenseTools the dashboard's Expenses section calls, exposed here so the Assistant can
// look up or record a business expense by natural language too (Section 10.7's "one function,
// multiple entry points"). Gated behind Permission.ViewAccounting — see OrderMcpTools' remarks.
[McpServerToolType]
public class ExpenseMcpTools(IExpenseTools expenseTools, ICurrentTenantProvider tenantProvider, IPermissionChecker permissionChecker)
{
    [McpServerTool(Name = "list_expenses"), Description("Lists this business's expenses, most recent first, optionally filtered to a date range (both from and to, ISO 8601).")]
    public Task<IReadOnlyList<ExpenseSummary>> ListExpenses(DateTimeOffset? from = null, DateTimeOffset? to = null, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ViewAccounting);
        return expenseTools.ListExpensesAsync(tenantProvider.CurrentBusinessId, from, to, cancellationToken);
    }

    [McpServerTool(Name = "create_expense"), Description("Records a business expense not tied to restocking inventory (rent, utilities, wages, supplies, transport, marketing, or other). category must be \"Rent\", \"Utilities\", \"Wages\", \"Supplies\", \"Transport\", \"Marketing\", or \"Other\". paymentMethod must be \"Cash\", \"EcoCash\", \"Bank\", or \"Other\". currency defaults to the business's own currency. incurredAt defaults to now. Only call this when the owner has clearly and explicitly described an expense that was actually paid.")]
    public Task<ExpenseSummary> CreateExpense(
        ExpenseCategory category, string description, decimal amount, PaymentProvider paymentMethod,
        string? currency = null, DateTimeOffset? incurredAt = null, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ViewAccounting);
        return expenseTools.CreateExpenseAsync(tenantProvider.CurrentBusinessId, category, description, amount, currency, paymentMethod, incurredAt, cancellationToken);
    }
}
