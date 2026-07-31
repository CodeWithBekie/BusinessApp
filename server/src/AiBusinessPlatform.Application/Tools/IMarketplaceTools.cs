using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Tools;

public record PublicBusinessSummary(Guid Id, string Name, string IndustryType, string Currency, decimal VatRate);

public record MarketplaceOrderResult(
    Guid OrderId, Guid BusinessId, string BusinessName, decimal TotalAmount, decimal VatAmount, string Currency,
    string PaymentReference, string? PaymentInstructions, IReadOnlyList<InvoiceLineItem> LineItems);

public record MarketplaceOrderSummary(
    Guid OrderId, Guid BusinessId, string BusinessName, OrderStatus Status,
    decimal TotalAmount, decimal VatAmount, string Currency, int ItemCount, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

// CanCancelDirectly (Quoted/Invoiced) and CanRequestCancellation (Paid) are mutually exclusive and
// both false once Fulfilled/Cancelled — the mobile order-detail screen uses these instead of
// re-deriving the same status logic itself. IsPaynowConnected gates whether "Pay with EcoCash" is
// worth showing at all for this order's business.
public record MarketplaceOrderDetail(
    Guid OrderId, Guid BusinessId, string BusinessName, OrderStatus Status,
    decimal TotalAmount, decimal VatAmount, int? InvoiceNumber, string Currency,
    IReadOnlyList<InvoiceLineItem> Items, OrderPaymentSummary? Payment, OrderDeliverySummary? Delivery,
    bool CanCancelDirectly, bool CanRequestCancellation, bool IsPaynowConnected,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public record EcoCashPaymentResult(string PaymentReference, string? Instructions, string? PollUrl);

// Customer-facing marketplace capabilities — kept separate from ICatalogTools/IOrderTools (which
// stay business-owner/staff-facing) rather than bloating those interfaces further. Exposed both as
// REST (MarketplaceEndpoints.cs, the human-driven checkout UI) and as MCP tools
// (MarketplaceMcpTools.cs, the customer-facing AI Assistant) — both hosts call this same
// implementation, "one function, multiple entry points" as with every other capability in this
// system. SubmitPaymentProofAsync is the one exception, staying REST-only: there's no reasonable
// way for a chat model to attach binary image bytes from a free-text conversation.
public interface IMarketplaceTools
{
    Task<IReadOnlyList<PublicBusinessSummary>> ListPubliclyListedBusinessesAsync(CancellationToken cancellationToken = default);

    // Caller must have already called ICurrentTenantSetter.SetBusinessId(businessId) — this thinly
    // wraps ICatalogTools.ListCatalogItemsAsync(businessId, activeOnly: true, ...).
    Task<IReadOnlyList<CatalogItemSummary>> BrowseCatalogAsync(Guid businessId, CancellationToken cancellationToken = default);

    // Composes CreateQuotationAsync + CreateInvoiceAsync back-to-back — "order then pay" as one
    // motion for a self-checkout customer, unlike staff who may want to review before invoicing.
    Task<MarketplaceOrderResult> PlaceOrderAsync(
        Guid businessId, Guid customerAccountId, IReadOnlyList<PosSaleLineItem> items, CancellationToken cancellationToken = default);

    // The one genuinely cross-tenant read in this feature — a customer's orders across every
    // business they've bought from, not scoped to one ambient tenant.
    Task<IReadOnlyList<MarketplaceOrderSummary>> ListMyOrdersAsync(Guid customerAccountId, CancellationToken cancellationToken = default);

    // Same cross-tenant ownership check as ListMyOrdersAsync, narrowed to one order — throws
    // KeyNotFoundException if orderId doesn't exist or isn't linked to this customerAccountId.
    Task<MarketplaceOrderDetail> GetMyOrderAsync(Guid orderId, Guid customerAccountId, CancellationToken cancellationToken = default);

    // Cancels an order that hasn't been paid yet (Quoted/Invoiced) — immediate, no approval needed.
    Task<OrderCancellationResult> CancelMyOrderAsync(Guid orderId, Guid customerAccountId, CancellationToken cancellationToken = default);

    // Requests cancellation of an already-Paid order — raises a PendingApproval for the business
    // owner rather than cancelling anything directly (mirrors the WhatsApp-orchestrator flow, but
    // targets this specific orderId rather than "most recent Paid order").
    Task<OrderCancellationRequestResult> RequestMyOrderCancellationAsync(Guid orderId, Guid customerAccountId, string? reason, CancellationToken cancellationToken = default);

    // Submits the customer's own EcoCash number to (re-)initiate payment for an unpaid order —
    // the invoice-time auto-attempt uses Customer.WhatsAppNumber, which may be a synthetic
    // placeholder for a marketplace-only customer, so this is the real "customer chooses to pay
    // now" action. Throws InvalidOperationException if the business has no PaynowConnection
    // configured (no silent fake reference) or the order isn't in a payable state.
    Task<EcoCashPaymentResult> PayWithEcoCashAsync(Guid orderId, Guid customerAccountId, string ecocashPhoneNumber, CancellationToken cancellationToken = default);

    // Customer uploads proof of an off-gateway payment (e.g. a bank/EcoCash transfer screenshot)
    // for the business to manually review — raises a payment_proof_submitted PendingApproval
    // rather than finalizing anything itself. Idempotent: re-submitting while one is already
    // Pending for this order does not raise a duplicate.
    Task SubmitPaymentProofAsync(Guid orderId, Guid customerAccountId, byte[] imageData, string contentType, CancellationToken cancellationToken = default);
}
