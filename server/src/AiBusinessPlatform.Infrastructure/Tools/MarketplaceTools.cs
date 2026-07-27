using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class MarketplaceTools(
    AiBusinessPlatformDbContext dbContext, ICatalogTools catalogTools, IOrderTools orderTools, ICurrentTenantProvider tenantProvider)
    : IMarketplaceTools
{
    public async Task<IReadOnlyList<PublicBusinessSummary>> ListPubliclyListedBusinessesAsync(CancellationToken cancellationToken = default)
    {
        // Business isn't ITenantScoped — no query filter exists here to bypass.
        return await dbContext.Businesses.AsNoTracking()
            .Where(b => b.IsPubliclyListed && b.Status == BusinessStatus.Active)
            .OrderBy(b => b.Name)
            .Select(b => new PublicBusinessSummary(b.Id, b.Name, b.IndustryType, b.Currency, b.VatRate))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<CatalogItemSummary>> BrowseCatalogAsync(Guid businessId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        return await catalogTools.ListCatalogItemsAsync(businessId, activeOnly: true, cancellationToken);
    }

    public async Task<MarketplaceOrderResult> PlaceOrderAsync(
        Guid businessId, Guid customerAccountId, IReadOnlyList<PosSaleLineItem> items, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var customer = await GetOrCreateLinkedCustomerAsync(businessId, customerAccountId, cancellationToken);

        await orderTools.CreateQuotationAsync(businessId, items, customer.Id, null, null, cancellationToken);
        var invoice = await orderTools.CreateInvoiceAsync(businessId, customer.Id, cancellationToken);

        var businessName = await dbContext.Businesses.AsNoTracking()
            .Where(b => b.Id == businessId)
            .Select(b => b.Name)
            .FirstAsync(cancellationToken);

        return new MarketplaceOrderResult(
            invoice.OrderId, businessId, businessName, invoice.TotalAmount, invoice.VatAmount, invoice.Currency,
            invoice.PaymentReference, invoice.PaymentInstructions, invoice.LineItems);
    }

    public async Task<IReadOnlyList<MarketplaceOrderSummary>> ListMyOrdersAsync(Guid customerAccountId, CancellationToken cancellationToken = default)
    {
        // Deliberately cross-tenant: a customer's linked Customer rows (and their orders) can span
        // any number of businesses, so this bypasses the ambient single-tenant query filter on
        // both Customers and Orders and instead filters by the customer's own linked ids —
        // mirroring the pattern WebhooksEndpoints.cs already uses for legitimate cross-tenant
        // lookups by a non-tenant key (there, a webhook reference; here, CustomerAccountId).
        var linkedCustomerIds = await dbContext.Customers.IgnoreQueryFilters()
            .Where(c => c.CustomerAccountId == customerAccountId)
            .Select(c => c.Id)
            .ToListAsync(cancellationToken);

        if (linkedCustomerIds.Count == 0)
        {
            return [];
        }

        var orders = await dbContext.Orders.IgnoreQueryFilters()
            .Where(o => linkedCustomerIds.Contains(o.CustomerId))
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync(cancellationToken);

        var businessIds = orders.Select(o => o.BusinessId).Distinct().ToList();
        var businessNames = await dbContext.Businesses.AsNoTracking()
            .Where(b => businessIds.Contains(b.Id))
            .ToDictionaryAsync(b => b.Id, b => b.Name, cancellationToken);

        var orderIds = orders.Select(o => o.Id).ToList();
        var itemCounts = await dbContext.OrderItems.IgnoreQueryFilters()
            .Where(oi => orderIds.Contains(oi.OrderId))
            .GroupBy(oi => oi.OrderId)
            .Select(g => new { OrderId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.OrderId, x => x.Count, cancellationToken);

        return orders
            .Select(o => new MarketplaceOrderSummary(
                o.Id, o.BusinessId, businessNames.GetValueOrDefault(o.BusinessId, "Unknown business"), o.Status,
                o.TotalAmount, o.VatAmount, o.Currency, itemCounts.GetValueOrDefault(o.Id, 0), o.CreatedAt, o.UpdatedAt))
            .ToList();
    }

    private async Task<Customer> GetOrCreateLinkedCustomerAsync(Guid businessId, Guid customerAccountId, CancellationToken cancellationToken)
    {
        var existing = await dbContext.Customers.FirstOrDefaultAsync(c => c.CustomerAccountId == customerAccountId, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        var account = await dbContext.CustomerAccounts.FirstAsync(a => a.Id == customerAccountId, cancellationToken);

        var customer = new Customer
        {
            Id = Guid.NewGuid(),
            BusinessId = businessId,
            WhatsAppNumber = account.PhoneNumber ?? $"acct-{account.Id:N}",
            Name = account.Name,
            CustomerAccountId = account.Id,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.Customers.Add(customer);
        await dbContext.SaveChangesAsync(cancellationToken);

        return customer;
    }
}
