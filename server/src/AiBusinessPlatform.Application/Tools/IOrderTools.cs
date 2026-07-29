using System.ComponentModel;
using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Tools;

public record InvoiceLineItem(Guid CatalogItemId, string Name, string Code, int Quantity, decimal UnitPrice, decimal Subtotal, decimal VatAmount);

// PaymentInstructions is null when no PaynowConnection is configured yet (manual/offline
// reference); otherwise it's Paynow's own human-readable USSD prompt text (e.g. "Enter your PIN
// on your phone to authorise this transaction") — the model reads this JSON verbatim when
// phrasing its reply to the customer, so no orchestrator/system-prompt change is needed beyond
// this field simply being present.
public record InvoiceResult(Guid OrderId, decimal TotalAmount, decimal VatAmount, string Currency, string PaymentReference, string? PaymentInstructions, IReadOnlyList<InvoiceLineItem> LineItems);

public record PaymentConfirmationResult(Guid OrderId, Guid PaymentId, OrderStatus OrderStatus, PaymentStatus PaymentStatus);

public record OrderCancellationRequestResult(bool Success, Guid? PendingApprovalId, Guid? OrderId, decimal? Amount, string? Currency, string? Reason);

public record OrderCancellationResult(Guid OrderId, OrderStatus Status);

public record OrderFulfillmentResult(Guid OrderId, OrderStatus Status);

public record PosSaleLineItem(Guid CatalogItemId, int Quantity);

public record PosSaleResult(
    Guid OrderId, decimal TotalAmount, decimal VatAmount, string Currency, string PaymentReference, IReadOnlyList<InvoiceLineItem> LineItems,
    Guid CustomerId, string CustomerWhatsAppNumber, string? CustomerName,
    decimal? AmountTendered, decimal? ChangeDue);

public record QuotationResult(
    Guid OrderId, decimal TotalAmount, decimal VatAmount, string Currency, IReadOnlyList<InvoiceLineItem> LineItems,
    Guid CustomerId, string CustomerWhatsAppNumber, string? CustomerName);

public record OrderSummary(
    Guid Id, Guid CustomerId, string CustomerWhatsAppNumber, string? CustomerName,
    OrderStatus Status, decimal TotalAmount, string Currency, int ItemCount,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public record OrderPaymentSummary(PaymentProvider Provider, string ProviderReference, PaymentStatus Status, decimal Amount, DateTimeOffset? ConfirmedAt, decimal? AmountTendered, decimal? ChangeDue);

public record OrderDetailSummary(
    Guid Id, Guid CustomerId, string CustomerWhatsAppNumber, string? CustomerName,
    OrderStatus Status, decimal TotalAmount, decimal VatAmount, int? InvoiceNumber, string Currency,
    IReadOnlyList<InvoiceLineItem> Items, OrderPaymentSummary? Payment,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public interface IOrderTools
{
    // Owner-facing order lookups, shared by the dashboard REST endpoints and the MCP/Assistant
    // tools (Section 10.2/10.7's "one function, multiple entry points").
    [Description("Lists this business's orders, most recent first, optionally filtered to one status: \"Quoted\", \"Invoiced\", \"Paid\", \"Fulfilled\", or \"Cancelled\".")]
    Task<IReadOnlyList<OrderSummary>> ListOrdersAsync(Guid businessId, OrderStatus? status, CancellationToken cancellationToken = default);

    [Description("Gets full detail for one order by its id: customer, line items, and payment status.")]
    Task<OrderDetailSummary> GetOrderAsync(Guid businessId, Guid orderId, CancellationToken cancellationToken = default);

    [Description("Creates an invoice for the customer's current open (reserved) order: computes the total from its reserved line items, transitions it to Invoiced, and creates the pending payment record the customer must pay against.")]
    Task<InvoiceResult> CreateInvoiceAsync(Guid businessId, Guid customerId, CancellationToken cancellationToken = default);

    // Deliberately never exposed as an AI tool (Section 10.5's human-in-the-loop principle
    // applied to money-received events) — only ever invoked by PaymentWebhookConsumer.
    Task<PaymentConfirmationResult> ConfirmPaymentAsync(Guid businessId, Guid orderId, CancellationToken cancellationToken = default);

    // AI-facing. Resolves "the customer's most recent Paid order" server-side rather than taking
    // an orderId from the model — same rationale ICatalogTools.ReleaseStockAsync already
    // documents (no structured tool-result data survives across conversation turns, only
    // plain-text history is persisted/reloaded). Never cancels/refunds anything itself — only
    // raises a PendingApproval via IApprovalTools (Section 10.5).
    // orderId is optional so the WhatsApp orchestrator (which has no stable "which order" signal
    // across conversation turns — see ICatalogTools.ReleaseStockAsync's own rationale) can keep
    // resolving "the customer's most recent Paid order" implicitly; the marketplace mobile app,
    // which already knows exactly which order the customer tapped, passes it explicitly instead —
    // more precise when a customer has more than one Paid order.
    [Description("Use when a customer wants to cancel an order or get a refund for an order that has ALREADY been paid (not a Quoted/unpaid order — use release_stock_reservation for those). Raises an approval request for the business owner instead of cancelling or refunding anything directly.")]
    Task<OrderCancellationRequestResult> RequestOrderCancellationApprovalAsync(Guid businessId, Guid customerId, string reason, Guid? orderId = null, CancellationToken cancellationToken = default);

    // Deliberately never exposed as an AI tool — only ever invoked by the dashboard approval
    // decision endpoint, after an explicit approval (Section 10.5).
    Task<OrderCancellationResult> CancelPaidOrderAsync(Guid businessId, Guid orderId, Guid? decidedBy, CancellationToken cancellationToken = default);

    // Deliberately never exposed as an AI tool — same as above, for the rejection outcome.
    Task NotifyOrderCancellationRejectedAsync(Guid businessId, Guid orderId, Guid? decidedBy, CancellationToken cancellationToken = default);

    // The marketplace-customer counterpart for an order that hasn't been paid yet (Quoted or
    // Invoiced) — no approval needed since no money has moved. Restores stock for every line item
    // and marks any stub Payment Failed. Not AI-facing (customerId is resolved server-side by the
    // caller, IMarketplaceTools, from the authenticated CustomerAccount — never trust one supplied
    // directly).
    Task<OrderCancellationResult> CancelUnpaidOrderAsync(Guid businessId, Guid orderId, Guid customerId, CancellationToken cancellationToken = default);

    // Finalizes a payment whose customer-uploaded proof was approved via the
    // payment_proof_submitted PendingApproval — mirrors RecordManualPaymentAsync's tail (stock
    // finalize, ledger post, receipt) but takes no fresh provider/reference/amount since those are
    // already fixed on the Payment row from IMarketplaceTools.SubmitPaymentProofAsync. Deliberately
    // never exposed as an AI tool — only ever invoked by the approval decision endpoint.
    Task<OrderDetailSummary> ConfirmManualPaymentProofAsync(Guid businessId, Guid orderId, Guid? decidedBy, CancellationToken cancellationToken = default);

    // FR18 (Section 6.3) — owner manually marks a paid order as delivered/fulfilled. Exposed via
    // the MCP server's mark_order_fulfilled tool (Section 10.2/10.7) so the owner's own Assistant
    // can do this too — but never exposed to the customer-facing WhatsApp orchestrator, and
    // decidedBy is always resolved server-side from the authenticated caller (ICurrentUserProvider),
    // never supplied by the model.
    Task<OrderFulfillmentResult> MarkOrderFulfilledAsync(Guid businessId, Guid orderId, Guid? decidedBy, CancellationToken cancellationToken = default);

    // New ground, not a spec section — a walk-in/in-person sale (no WhatsApp conversation ever
    // happens). Finalizes as Paid in one step since the money has already changed hands (cash) or
    // already cleared (card/mobile money tap) — no Quoted/Invoiced intermediate stage. Exposed via
    // the MCP server's record_pos_sale tool so the owner's own Assistant can record a sale by
    // natural language too.
    [Description("Records an in-person/walk-in sale that's already been paid for (cash, card, or mobile money tapped at the counter) — creates the order, decrements stock, and marks it Paid immediately. paymentMethod must be \"Cash\", \"EcoCash\", \"Bank\", or \"Other\". To attach an existing customer (found via ICustomerTools.ListCustomersAsync), pass customerId and leave customerWhatsAppNumber/customerName null. To record a new or repeat customer by phone, pass customerWhatsAppNumber (and optionally customerName, which also updates the name on an existing match). Omit all three for an anonymous walk-in sale. customerName without a customerWhatsAppNumber or customerId is invalid — a phone number is required to save a name. amountTendered is only meaningful for Cash sales — pass how much cash was handed over so the change due can be computed; it must be at least the total; leave it null if you don't need change calculated, and never pass it for a non-Cash paymentMethod.")]
    Task<PosSaleResult> RecordPosSaleAsync(Guid businessId, IReadOnlyList<PosSaleLineItem> items, string paymentMethod, Guid? customerId, string? customerWhatsAppNumber, string? customerName, decimal? amountTendered = null, CancellationToken cancellationToken = default);

    // New ground, not a spec section — a quotation is the "not paid yet" counterpart to
    // RecordPosSaleAsync: same multi-item cart shape and customer-resolution rules, but reuses
    // ICatalogTools.ReserveStockAsync per line (reserve stock + create/merge into a Quoted order)
    // instead of decrementing stock and creating a Payment directly. Later becomes an Invoiced
    // order via CreateInvoiceAsync once the customer is ready to pay.
    [Description("Creates a quotation for a customer from one or more catalog items: reserves stock and creates (or adds to) their open Quoted order, without collecting any payment yet. To attach an existing customer (found via ICustomerTools.ListCustomersAsync), pass customerId and leave customerWhatsAppNumber/customerName null. To create/record a new or repeat customer by phone, pass customerWhatsAppNumber (optionally with customerName). Omit all three for an anonymous walk-in quotation. Call create_invoice afterward once the customer is ready to pay.")]
    Task<QuotationResult> CreateQuotationAsync(Guid businessId, IReadOnlyList<PosSaleLineItem> items, Guid? customerId, string? customerWhatsAppNumber, string? customerName, CancellationToken cancellationToken = default);

    // New ground, not a spec section — manually records payment collected outside the automated
    // gateway (cash handed over, bank transfer received) for an order that isn't Paid yet. Creates
    // the Payment row if none exists (a Quoted order that was never invoiced), or finalizes an
    // existing Pending one (an Invoiced order's stub payment). Reuses ICatalogTools.FinalizeStockAsync
    // per line — same validation-only finalize ConfirmPaymentAsync already does, since stock was
    // decremented at reserve time. Rejects Paid/Fulfilled/Cancelled orders.
    [Description("Manually records and confirms the payment for an order that isn't Paid yet — use when a customer paid by cash, bank transfer, or another method outside the automated payment gateway. Sets the provider, reference, and amount, marks the payment Confirmed, and transitions the order to Paid regardless of how the amount compares to the order total (e.g. an agreed discount or rounding adjustment) — this does not support partial/installment payments, the order is always fully Paid after this call. provider must be \"Cash\", \"EcoCash\", \"Bank\", or \"Other\". amount must be greater than zero. Fails if the order is already Paid, Fulfilled, or Cancelled.")]
    Task<OrderDetailSummary> RecordManualPaymentAsync(Guid businessId, Guid orderId, PaymentProvider provider, string reference, decimal amount, CancellationToken cancellationToken = default);

    // Deliberately narrow — only the provider is editable (confirmed with the user), not the
    // reference or status; correcting those isn't supported. Fulfilled/Cancelled orders are locked.
    [Description("Corrects the payment method on an order's already-confirmed payment — e.g. it was logged as Cash but was actually a Bank transfer. provider must be \"Cash\", \"EcoCash\", \"Bank\", or \"Other\". Fails if the order has no confirmed payment yet, or is Fulfilled/Cancelled.")]
    Task<OrderDetailSummary> UpdatePaymentProviderAsync(Guid businessId, Guid orderId, PaymentProvider provider, CancellationToken cancellationToken = default);
}
