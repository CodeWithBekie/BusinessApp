using System.Text.Json;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class MarketplaceTools(
    AiBusinessPlatformDbContext dbContext, ICatalogTools catalogTools, IOrderTools orderTools, IPaymentTools paymentTools,
    IApprovalTools approvalTools, ICurrentTenantProvider tenantProvider, ICurrentTenantSetter tenantSetter)
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

        return await catalogTools.ListCatalogItemsAsync(businessId, activeOnly: true, lowStockOnly: null, cancellationToken);
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

    public async Task<MarketplaceOrderDetail> GetMyOrderAsync(Guid orderId, Guid customerAccountId, CancellationToken cancellationToken = default)
    {
        var order = await ResolveOwnedOrderAsync(orderId, customerAccountId, cancellationToken);

        var detail = await orderTools.GetOrderAsync(order.BusinessId, orderId, cancellationToken);
        var businessName = await dbContext.Businesses.AsNoTracking()
            .Where(b => b.Id == order.BusinessId)
            .Select(b => b.Name)
            .FirstAsync(cancellationToken);
        var isPaynowConnected = await dbContext.PaynowConnections.AnyAsync(c => c.BusinessId == order.BusinessId, cancellationToken);

        return new MarketplaceOrderDetail(
            detail.Id, order.BusinessId, businessName, detail.Status,
            detail.TotalAmount, detail.VatAmount, detail.InvoiceNumber, detail.Currency,
            detail.Items, detail.Payment, detail.Delivery,
            CanCancelDirectly: detail.Status is OrderStatus.Quoted or OrderStatus.Invoiced,
            CanRequestCancellation: detail.Status == OrderStatus.Paid,
            IsPaynowConnected: isPaynowConnected,
            detail.CreatedAt, detail.UpdatedAt);
    }

    public async Task<OrderCancellationResult> CancelMyOrderAsync(Guid orderId, Guid customerAccountId, CancellationToken cancellationToken = default)
    {
        var order = await ResolveOwnedOrderAsync(orderId, customerAccountId, cancellationToken);
        return await orderTools.CancelUnpaidOrderAsync(order.BusinessId, orderId, order.CustomerId, cancellationToken);
    }

    public async Task<OrderCancellationRequestResult> RequestMyOrderCancellationAsync(Guid orderId, Guid customerAccountId, string? reason, CancellationToken cancellationToken = default)
    {
        var order = await ResolveOwnedOrderAsync(orderId, customerAccountId, cancellationToken);
        return await orderTools.RequestOrderCancellationApprovalAsync(
            order.BusinessId, order.CustomerId, reason ?? "Customer requested cancellation.", orderId, cancellationToken);
    }

    public async Task<EcoCashPaymentResult> PayWithEcoCashAsync(Guid orderId, Guid customerAccountId, string ecocashPhoneNumber, CancellationToken cancellationToken = default)
    {
        var order = await ResolveOwnedOrderAsync(orderId, customerAccountId, cancellationToken);

        if (order.Status != OrderStatus.Invoiced)
        {
            throw new InvalidOperationException($"Order {orderId} is {order.Status} — EcoCash payment is only available for an unpaid, invoiced order.");
        }

        var payment = await dbContext.Payments.FirstOrDefaultAsync(p => p.OrderId == order.Id && p.Status == PaymentStatus.Pending, cancellationToken)
            ?? throw new InvalidOperationException($"Order {orderId} has no pending payment to pay.");

        // EcoCash (direct) is preferred and checked first by PaymentTools.CreatePaymentRequestAsync,
        // but Paynow's own "ecocash" method remains a valid fallback gateway — either connection
        // makes this action available.
        var hasGateway = await dbContext.EcoCashConnections.AnyAsync(c => c.BusinessId == order.BusinessId, cancellationToken)
            || await dbContext.PaynowConnections.AnyAsync(c => c.BusinessId == order.BusinessId, cancellationToken);
        if (!hasGateway)
        {
            throw new InvalidOperationException("EcoCash isn't available for this business yet — upload proof of payment instead.");
        }

        var paymentRequest = await paymentTools.CreatePaymentRequestAsync(
            order.BusinessId, order.Id, order.TotalAmount, order.Currency, ecocashPhoneNumber, cancellationToken);

        payment.Provider = PaymentProvider.EcoCash;
        payment.ProviderReference = paymentRequest.PaymentReference;
        payment.PollUrl = paymentRequest.PollUrl;
        payment.EcoCashEndUserId = ecocashPhoneNumber;

        await dbContext.SaveChangesAsync(cancellationToken);

        return new EcoCashPaymentResult(paymentRequest.PaymentReference, paymentRequest.Instructions, paymentRequest.PollUrl);
    }

    public async Task SubmitPaymentProofAsync(Guid orderId, Guid customerAccountId, byte[] imageData, string contentType, CancellationToken cancellationToken = default)
    {
        var order = await ResolveOwnedOrderAsync(orderId, customerAccountId, cancellationToken);

        if (order.Status != OrderStatus.Invoiced)
        {
            throw new InvalidOperationException($"Order {orderId} is {order.Status} — a payment proof can only be submitted for an unpaid, invoiced order.");
        }

        var payment = await dbContext.Payments.FirstOrDefaultAsync(p => p.OrderId == order.Id && p.Status == PaymentStatus.Pending, cancellationToken)
            ?? throw new InvalidOperationException($"Order {orderId} has no pending payment to submit proof for.");

        // Idempotent — don't raise a second review request while one is already pending.
        var alreadyPending = await dbContext.PendingApprovals.AnyAsync(
            a => a.BusinessId == order.BusinessId && a.ActionType == ApprovalActionTypes.PaymentProofSubmitted
                && a.Status == ApprovalStatus.Pending && a.DetailsJson.Contains(orderId.ToString()),
            cancellationToken);
        if (alreadyPending)
        {
            return;
        }

        payment.ProofImageData = imageData;
        payment.ProofImageContentType = contentType;
        payment.ProofSubmittedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);

        var details = new PaymentProofSubmittedDetails(order.Id, payment.Id, customerAccountId, DateTimeOffset.UtcNow);
        await approvalTools.RequestApprovalAsync(order.BusinessId, ApprovalActionTypes.PaymentProofSubmitted, JsonSerializer.Serialize(details), cancellationToken);
    }

    // Resolves the caller's own linked Customer id(s) from the authenticated CustomerAccountId
    // (never a client-supplied one — same pattern as ListMyOrdersAsync), then verifies the order
    // actually belongs to one of them. Sets the tenant context from the verified order's own
    // BusinessId — never from a client-supplied businessId — so downstream IOrderTools calls'
    // "businessId != tenantProvider.CurrentBusinessId" guard passes legitimately.
    private async Task<Order> ResolveOwnedOrderAsync(Guid orderId, Guid customerAccountId, CancellationToken cancellationToken)
    {
        var linkedCustomerIds = await dbContext.Customers.IgnoreQueryFilters()
            .Where(c => c.CustomerAccountId == customerAccountId)
            .Select(c => c.Id)
            .ToListAsync(cancellationToken);

        var order = await dbContext.Orders.IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => o.Id == orderId && linkedCustomerIds.Contains(o.CustomerId), cancellationToken)
            ?? throw new KeyNotFoundException($"Order {orderId} not found.");

        tenantSetter.SetBusinessId(order.BusinessId);
        return order;
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
