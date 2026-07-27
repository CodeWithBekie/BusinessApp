using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class ExpenseTools(AiBusinessPlatformDbContext dbContext, ICurrentTenantProvider tenantProvider) : IExpenseTools
{
    public async Task<IReadOnlyList<ExpenseSummary>> ListExpensesAsync(
        Guid businessId, DateTimeOffset? from = null, DateTimeOffset? to = null, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var query = dbContext.Expenses.AsNoTracking().AsQueryable();
        if (from is not null)
        {
            query = query.Where(e => e.IncurredAt >= from);
        }
        if (to is not null)
        {
            query = query.Where(e => e.IncurredAt <= to);
        }

        return await query
            .OrderByDescending(e => e.IncurredAt)
            .Select(e => new ExpenseSummary(e.Id, e.Category, e.Description, e.Amount, e.Currency, e.PaymentMethod, e.IncurredAt, e.CreatedAt))
            .ToListAsync(cancellationToken);
    }

    public async Task<ExpenseSummary> CreateExpenseAsync(
        Guid businessId, ExpenseCategory category, string description, decimal amount, string? currency,
        PaymentProvider paymentMethod, DateTimeOffset? incurredAt = null, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }
        if (string.IsNullOrWhiteSpace(description))
        {
            throw new ArgumentException("description is required.", nameof(description));
        }
        if (amount <= 0)
        {
            throw new ArgumentException("amount must be greater than zero.", nameof(amount));
        }

        var resolvedCurrency = currency;
        if (string.IsNullOrWhiteSpace(resolvedCurrency))
        {
            var business = await dbContext.Businesses.AsNoTracking().FirstAsync(b => b.Id == businessId, cancellationToken);
            resolvedCurrency = business.Currency;
        }

        var expense = new Expense
        {
            Id = Guid.NewGuid(),
            BusinessId = businessId,
            Category = category,
            Description = description.Trim(),
            Amount = amount,
            Currency = resolvedCurrency.Trim(),
            PaymentMethod = paymentMethod,
            IncurredAt = incurredAt ?? DateTimeOffset.UtcNow,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.Expenses.Add(expense);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new ExpenseSummary(expense.Id, expense.Category, expense.Description, expense.Amount, expense.Currency, expense.PaymentMethod, expense.IncurredAt, expense.CreatedAt);
    }

    public async Task DeleteExpenseAsync(Guid businessId, Guid expenseId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var expense = await dbContext.Expenses.FirstOrDefaultAsync(e => e.Id == expenseId, cancellationToken)
            ?? throw new KeyNotFoundException($"Expense {expenseId} not found.");

        dbContext.Expenses.Remove(expense);
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
