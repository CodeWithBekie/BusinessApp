using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class CustomerTools(AiBusinessPlatformDbContext dbContext, ICurrentTenantProvider tenantProvider) : ICustomerTools
{
    public async Task<IReadOnlyList<CustomerSummary>> ListCustomersAsync(Guid businessId, string? search, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        // Excludes the shared "walk-in" sentinel (OrderTools.GetOrCreateWalkInCustomerAsync) — it's
        // not a real customer a user would ever want to pick from this list.
        var query = dbContext.Customers.AsNoTracking().Where(c => c.WhatsAppNumber != "walk-in");

        if (!string.IsNullOrWhiteSpace(search))
        {
            var trimmed = search.Trim();
            query = query.Where(c => EF.Functions.ILike(c.WhatsAppNumber, $"%{trimmed}%") || (c.Name != null && EF.Functions.ILike(c.Name, $"%{trimmed}%")));
        }

        var customers = await query.OrderByDescending(c => c.CreatedAt).Take(20).ToListAsync(cancellationToken);
        var customerIds = customers.Select(c => c.Id).ToList();

        var orderCounts = await dbContext.Orders.AsNoTracking()
            .Where(o => customerIds.Contains(o.CustomerId))
            .GroupBy(o => o.CustomerId)
            .Select(g => new { CustomerId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.CustomerId, g => g.Count, cancellationToken);

        return customers
            .Select(c => new CustomerSummary(c.Id, c.WhatsAppNumber, c.Name, orderCounts.GetValueOrDefault(c.Id), c.CreatedAt))
            .ToList();
    }

    public async Task<CustomerSummary> GetCustomerAsync(Guid businessId, Guid customerId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var customer = await dbContext.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == customerId, cancellationToken)
            ?? throw new InvalidOperationException($"Customer {customerId} not found.");

        var orderCount = await dbContext.Orders.AsNoTracking().CountAsync(o => o.CustomerId == customerId, cancellationToken);

        return new CustomerSummary(customer.Id, customer.WhatsAppNumber, customer.Name, orderCount, customer.CreatedAt);
    }
}
