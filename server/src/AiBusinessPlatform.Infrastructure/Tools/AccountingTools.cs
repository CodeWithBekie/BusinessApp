using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class AccountingTools(AiBusinessPlatformDbContext dbContext, ICurrentTenantProvider tenantProvider) : IAccountingTools
{
    public async Task<CashUpResult> GetCashUpAsync(Guid businessId, DateOnly? date = null, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var day = date ?? DateOnly.FromDateTime(DateTimeOffset.UtcNow.UtcDateTime);
        var dayStart = new DateTimeOffset(day.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var dayEnd = dayStart.AddDays(1);

        // Same revenue-recognition join as InsightsTools.GetSalesSummaryAsync (Payment.ConfirmedAt
        // is the actual moment money came in, not Order.CreatedAt/UpdatedAt).
        var salesRows = await (
            from o in dbContext.Orders.AsNoTracking()
            join p in dbContext.Payments.AsNoTracking() on o.Id equals p.OrderId
            where (o.Status == OrderStatus.Paid || o.Status == OrderStatus.Fulfilled)
                  && p.ConfirmedAt != null && p.ConfirmedAt >= dayStart && p.ConfirmedAt < dayEnd
            select new { o.Currency, p.Provider, p.Amount }
        ).ToListAsync(cancellationToken);

        var expenseRows = await dbContext.Expenses.AsNoTracking()
            .Where(e => e.IncurredAt >= dayStart && e.IncurredAt < dayEnd)
            .Select(e => new { e.Currency, Provider = e.PaymentMethod, e.Amount })
            .ToListAsync(cancellationToken);

        var currencies = salesRows.Select(x => x.Currency).Concat(expenseRows.Select(x => x.Currency)).Distinct().OrderBy(c => c);

        var groups = currencies.Select(currency =>
        {
            var salesByProvider = salesRows
                .Where(x => x.Currency == currency)
                .GroupBy(x => x.Provider)
                .Select(g => new CashUpProviderTotal(g.Key, g.Count(), g.Sum(x => x.Amount)))
                .OrderBy(t => t.Provider)
                .ToList();

            var expensesByProvider = expenseRows
                .Where(x => x.Currency == currency)
                .GroupBy(x => x.Provider)
                .Select(g => new CashUpProviderTotal(g.Key, g.Count(), g.Sum(x => x.Amount)))
                .OrderBy(t => t.Provider)
                .ToList();

            var cashSales = salesByProvider.FirstOrDefault(t => t.Provider == PaymentProvider.Cash)?.TotalAmount ?? 0m;
            var cashExpenses = expensesByProvider.FirstOrDefault(t => t.Provider == PaymentProvider.Cash)?.TotalAmount ?? 0m;

            return new CashUpCurrencyGroup(currency, salesByProvider, expensesByProvider, cashSales - cashExpenses);
        }).ToList();

        return new CashUpResult(day, groups);
    }

    public async Task<ProfitAndLossResult> GetProfitAndLossAsync(
        Guid businessId, string? range = null, DateTimeOffset? from = null, DateTimeOffset? to = null, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var (rangeKey, rangeStart, rangeEnd) = ReportDateRangeResolver.Resolve(range, from, to);

        var query =
            from o in dbContext.Orders.AsNoTracking()
            join p in dbContext.Payments.AsNoTracking() on o.Id equals p.OrderId
            where (o.Status == OrderStatus.Paid || o.Status == OrderStatus.Fulfilled) && p.ConfirmedAt != null
            select new { o.Id, o.Currency, o.TotalAmount, o.VatAmount, p.ConfirmedAt };

        if (rangeStart is not null)
        {
            query = query.Where(x => x.ConfirmedAt >= rangeStart);
        }
        if (rangeEnd is not null)
        {
            query = query.Where(x => x.ConfirmedAt <= rangeEnd);
        }

        var rows = await query.ToListAsync(cancellationToken);

        // Revenue is VAT-exclusive — VAT collected on behalf of the tax authority isn't income.
        var revenueByCurrency = rows
            .GroupBy(x => x.Currency)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.TotalAmount - x.VatAmount));

        var orderIds = rows.Select(x => x.Id).ToList();

        // COGS uses CatalogItem.Cost (most recent purchase-order unit cost, set at receive time) —
        // not true FIFO/weighted-average costing (known simplification, surfaced in the UI).
        var cogsByCurrency = (await (
            from oi in dbContext.OrderItems.AsNoTracking()
            join o in dbContext.Orders.AsNoTracking() on oi.OrderId equals o.Id
            join ci in dbContext.CatalogItems.AsNoTracking() on oi.CatalogItemId equals ci.Id
            where orderIds.Contains(oi.OrderId)
            select new { o.Currency, oi.Quantity, ci.Cost }
        ).ToListAsync(cancellationToken))
            .GroupBy(x => x.Currency)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity * (x.Cost ?? 0)));

        var expenseQuery = dbContext.Expenses.AsNoTracking().AsQueryable();
        if (rangeStart is not null)
        {
            expenseQuery = expenseQuery.Where(e => e.IncurredAt >= rangeStart);
        }
        if (rangeEnd is not null)
        {
            expenseQuery = expenseQuery.Where(e => e.IncurredAt <= rangeEnd);
        }

        var expensesByCurrency = (await expenseQuery.ToListAsync(cancellationToken))
            .GroupBy(e => e.Currency)
            .ToDictionary(g => g.Key, g => g.Sum(e => e.Amount));

        var currencies = revenueByCurrency.Keys.Concat(cogsByCurrency.Keys).Concat(expensesByCurrency.Keys).Distinct().OrderBy(c => c);

        var breakdowns = currencies.Select(currency =>
        {
            var revenue = revenueByCurrency.GetValueOrDefault(currency);
            var cogs = cogsByCurrency.GetValueOrDefault(currency);
            var grossProfit = revenue - cogs;
            var expenses = expensesByCurrency.GetValueOrDefault(currency);
            var netProfit = grossProfit - expenses;
            return new ProfitAndLossCurrencyBreakdown(currency, revenue, cogs, grossProfit, expenses, netProfit);
        }).ToList();

        return new ProfitAndLossResult(rangeKey, rangeStart, rangeEnd, breakdowns);
    }
}
