using System.ComponentModel;
using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Tools;

public record ExpenseSummary(
    Guid Id, ExpenseCategory Category, string Description, decimal Amount, string Currency,
    PaymentProvider PaymentMethod, DateTimeOffset IncurredAt, DateTimeOffset CreatedAt);

// Generic non-inventory spend (rent, utilities, wages, etc.) — the counterpart to purchase orders
// (which are specifically for restocking catalog items). Shared by the dashboard REST endpoints
// and the MCP/Assistant tools (Section 10.2/10.7's "one function, multiple entry points").
public interface IExpenseTools
{
    [Description("Lists this business's expenses, most recent first, optionally filtered to a date range (both from and to, ISO 8601).")]
    Task<IReadOnlyList<ExpenseSummary>> ListExpensesAsync(Guid businessId, DateTimeOffset? from = null, DateTimeOffset? to = null, CancellationToken cancellationToken = default);

    [Description("Records a business expense not tied to restocking inventory (rent, utilities, wages, supplies, transport, marketing, or other). category must be \"Rent\", \"Utilities\", \"Wages\", \"Supplies\", \"Transport\", \"Marketing\", or \"Other\". paymentMethod must be \"Cash\", \"EcoCash\", \"Bank\", or \"Other\". currency defaults to the business's own currency. incurredAt defaults to now.")]
    Task<ExpenseSummary> CreateExpenseAsync(
        Guid businessId, ExpenseCategory category, string description, decimal amount, string? currency,
        PaymentProvider paymentMethod, DateTimeOffset? incurredAt = null, CancellationToken cancellationToken = default);

    [Description("Deletes an expense entry — use when one was recorded in error.")]
    Task DeleteExpenseAsync(Guid businessId, Guid expenseId, CancellationToken cancellationToken = default);
}
