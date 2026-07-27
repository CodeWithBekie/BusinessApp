using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class InsightsTools(AiBusinessPlatformDbContext dbContext, ICurrentTenantProvider tenantProvider) : IInsightsTools
{
    public async Task<SalesInsight> GetSalesSummaryAsync(Guid businessId, string? range, DateTimeOffset? from = null, DateTimeOffset? to = null, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var (rangeKey, rangeStart, rangeEnd) = ReportDateRangeResolver.Resolve(range, from, to);

        // Revenue is recognized against Payment.ConfirmedAt (the actual moment money came in), not
        // Order.CreatedAt/UpdatedAt — the latter keeps moving every time an order's status changes
        // again (e.g. Paid -> Fulfilled), which would silently shift older revenue into the wrong
        // day/range. Counts both Paid and Fulfilled orders — an earlier version of this query only
        // counted Paid, so any order later marked Fulfilled quietly dropped out of sales totals.
        var query =
            from o in dbContext.Orders.AsNoTracking()
            join p in dbContext.Payments.AsNoTracking() on o.Id equals p.OrderId
            where (o.Status == OrderStatus.Paid || o.Status == OrderStatus.Fulfilled) && p.ConfirmedAt != null
            select new { o, p };

        if (rangeStart is not null)
        {
            query = query.Where(x => x.p.ConfirmedAt >= rangeStart);
        }
        if (rangeEnd is not null)
        {
            query = query.Where(x => x.p.ConfirmedAt <= rangeEnd);
        }

        var rows = await query.ToListAsync(cancellationToken);

        // Grouped by currency rather than summed blindly, since Order.Currency is inherited
        // per-order from whichever CatalogItem was ordered (Section 11) and a business can
        // plausibly sell items priced in more than one currency.
        var totals = rows
            .GroupBy(x => x.o.Currency)
            .Select(g => new SalesInsightCurrencyTotal(g.Key, g.Count(), g.Sum(x => x.o.TotalAmount)))
            .OrderByDescending(t => t.TotalAmount)
            .ToList();

        // Skipped for "all" — an unbounded range could span years of daily points, which isn't
        // useful as a trend chart (known Phase 0 simplification).
        var trend = rangeKey == "all"
            ? new List<SalesInsightTrendPoint>()
            : rows
                .GroupBy(x => DateOnly.FromDateTime(x.p.ConfirmedAt!.Value.UtcDateTime))
                .Select(g => new SalesInsightTrendPoint(g.Key, g.Count(), g.Sum(x => x.o.TotalAmount)))
                .OrderBy(t => t.Date)
                .ToList();

        var orderIds = rows.Select(x => x.o.Id).ToList();
        var topItems = await (
            from oi in dbContext.OrderItems.AsNoTracking()
            join ci in dbContext.CatalogItems.AsNoTracking() on oi.CatalogItemId equals ci.Id
            where orderIds.Contains(oi.OrderId)
            group oi by new { oi.CatalogItemId, ci.Name } into g
            orderby g.Sum(x => x.Subtotal) descending
            select new SalesInsightTopItem(g.Key.CatalogItemId, g.Key.Name, g.Sum(x => x.Quantity), g.Sum(x => x.Subtotal))
        ).Take(5).ToListAsync(cancellationToken);

        return new SalesInsight(rangeKey, rangeStart, rangeEnd, rows.Count, totals, trend, topItems);
    }
}
