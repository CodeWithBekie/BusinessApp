using System.ComponentModel;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Tools;

// The customer-facing counterpart to OrderMcpTools/CatalogMcpTools — same IMarketplaceTools the
// mobile marketplace REST endpoints call (MarketplaceEndpoints.cs), exposed here for the new
// customer Assistant chat (Section: customer dashboard/assistant redesign). Customers have no
// Permission/RBAC concept (that's business-staff-only), so RequireCustomerAccountId() is this
// class's only enforcement point — it throws for a business JWT (no customer_account_id claim)
// exactly like ICurrentTenantProvider.CurrentBusinessId already throws for a customer JWT calling
// any *business* tool. SubmitPaymentProofAsync is deliberately NOT exposed here — there's no
// reasonable way for a chat model to attach binary image bytes from free-text conversation; that
// stays a direct REST upload from the mobile order-detail screen.
[McpServerToolType]
public class MarketplaceMcpTools(IMarketplaceTools marketplaceTools, ICurrentCustomerProvider customerProvider, ICurrentTenantSetter tenantSetter)
{
    private Guid RequireCustomerAccountId() =>
        customerProvider.CurrentCustomerAccountId
            ?? throw new UnauthorizedAccessException("This action requires an authenticated customer account.");

    [McpServerTool(Name = "list_marketplace_businesses"), Description("Lists businesses open for marketplace ordering: name, industry, currency, VAT rate.")]
    public Task<IReadOnlyList<PublicBusinessSummary>> ListMarketplaceBusinesses(CancellationToken cancellationToken = default)
    {
        RequireCustomerAccountId();
        return marketplaceTools.ListPubliclyListedBusinessesAsync(cancellationToken);
    }

    [McpServerTool(Name = "browse_business_catalog"), Description("Lists a business's active catalog items with price and stock. Call list_marketplace_businesses first to resolve businessId if the customer only gave a business name — never guess an id.")]
    public Task<IReadOnlyList<CatalogItemSummary>> BrowseBusinessCatalog(Guid businessId, CancellationToken cancellationToken = default)
    {
        RequireCustomerAccountId();
        tenantSetter.SetBusinessId(businessId);
        return marketplaceTools.BrowseCatalogAsync(businessId, cancellationToken);
    }

    [McpServerTool(Name = "place_marketplace_order"), Description("Places an order with one business for one or more catalog items — this creates the invoice immediately (self-checkout, not a quote awaiting review). Resolve catalogItemId via browse_business_catalog first — never guess an id or quantity. Only call this once the customer has clearly confirmed exactly what and how much they want to buy.")]
    public Task<MarketplaceOrderResult> PlaceMarketplaceOrder(Guid businessId, IReadOnlyList<PosSaleLineItem> items, CancellationToken cancellationToken = default)
    {
        var customerAccountId = RequireCustomerAccountId();
        tenantSetter.SetBusinessId(businessId);
        return marketplaceTools.PlaceOrderAsync(businessId, customerAccountId, items, cancellationToken);
    }

    [McpServerTool(Name = "list_my_orders"), Description("Lists the customer's own orders across every business they've bought from, most recent first.")]
    public Task<IReadOnlyList<MarketplaceOrderSummary>> ListMyOrders(CancellationToken cancellationToken = default)
        => marketplaceTools.ListMyOrdersAsync(RequireCustomerAccountId(), cancellationToken);

    [McpServerTool(Name = "get_my_order"), Description("Gets full detail for one of the customer's own orders: items, status, payment, and whether it can still be cancelled directly or only requested for cancellation. Resolve orderId via list_my_orders first — never guess an id.")]
    public Task<MarketplaceOrderDetail> GetMyOrder(Guid orderId, CancellationToken cancellationToken = default)
        => marketplaceTools.GetMyOrderAsync(orderId, RequireCustomerAccountId(), cancellationToken);

    [McpServerTool(Name = "cancel_my_order"), Description("Cancels one of the customer's own orders immediately — only works while it's Quoted/Invoiced (not yet paid). Use get_my_order first to check canCancelDirectly. Only call when the customer has clearly asked to cancel this specific order.")]
    public Task<OrderCancellationResult> CancelMyOrder(Guid orderId, CancellationToken cancellationToken = default)
        => marketplaceTools.CancelMyOrderAsync(orderId, RequireCustomerAccountId(), cancellationToken);

    [McpServerTool(Name = "request_my_order_cancellation"), Description("Requests cancellation of one of the customer's own already-Paid orders — this raises a request for the business to approve, it does not cancel anything immediately. Use get_my_order first to check canRequestCancellation.")]
    public Task<OrderCancellationRequestResult> RequestMyOrderCancellation(Guid orderId, string? reason = null, CancellationToken cancellationToken = default)
        => marketplaceTools.RequestMyOrderCancellationAsync(orderId, RequireCustomerAccountId(), reason, cancellationToken);

    [McpServerTool(Name = "pay_my_order_with_ecocash"), Description("Initiates EcoCash payment for one of the customer's own unpaid, invoiced orders using the phone number they provide. Fails if the business hasn't connected EcoCash — in that case tell the customer to upload payment proof from the order details screen instead.")]
    public Task<EcoCashPaymentResult> PayMyOrderWithEcoCash(Guid orderId, string ecocashPhoneNumber, CancellationToken cancellationToken = default)
        => marketplaceTools.PayWithEcoCashAsync(orderId, RequireCustomerAccountId(), ecocashPhoneNumber, cancellationToken);
}
