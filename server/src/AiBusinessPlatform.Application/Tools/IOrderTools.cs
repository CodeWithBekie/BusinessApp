using System.ComponentModel;
using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Tools;

public record InvoiceLineItem(Guid CatalogItemId, string Name, int Quantity, decimal UnitPrice, decimal Subtotal);

// PaymentInstructions is null when no PaynowConnection is configured yet (manual/offline
// reference); otherwise it's Paynow's own human-readable USSD prompt text (e.g. "Enter your PIN
// on your phone to authorise this transaction") — the model reads this JSON verbatim when
// phrasing its reply to the customer, so no orchestrator/system-prompt change is needed beyond
// this field simply being present.
public record InvoiceResult(Guid OrderId, decimal TotalAmount, string Currency, string PaymentReference, string? PaymentInstructions, IReadOnlyList<InvoiceLineItem> LineItems);

public record PaymentConfirmationResult(Guid OrderId, Guid PaymentId, OrderStatus OrderStatus, PaymentStatus PaymentStatus);

public record OrderCancellationRequestResult(bool Success, Guid? PendingApprovalId, Guid? OrderId, decimal? Amount, string? Currency, string? Reason);

public record OrderCancellationResult(Guid OrderId, OrderStatus Status);

public record OrderFulfillmentResult(Guid OrderId, OrderStatus Status);

public interface IOrderTools
{
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
    [Description("Use when a customer wants to cancel an order or get a refund for an order that has ALREADY been paid (not a Quoted/unpaid order — use release_stock_reservation for those). Raises an approval request for the business owner instead of cancelling or refunding anything directly.")]
    Task<OrderCancellationRequestResult> RequestOrderCancellationApprovalAsync(Guid businessId, Guid customerId, string reason, CancellationToken cancellationToken = default);

    // Deliberately never exposed as an AI tool — only ever invoked by the dashboard approval
    // decision endpoint, after an explicit approval (Section 10.5).
    Task<OrderCancellationResult> CancelPaidOrderAsync(Guid businessId, Guid orderId, Guid? decidedBy, CancellationToken cancellationToken = default);

    // Deliberately never exposed as an AI tool — same as above, for the rejection outcome.
    Task NotifyOrderCancellationRejectedAsync(Guid businessId, Guid orderId, Guid? decidedBy, CancellationToken cancellationToken = default);

    // FR18 (Section 6.3) — owner manually marks a paid order as delivered/fulfilled. Deliberately
    // never exposed as an AI tool — this is a business-owner dashboard action, not something a
    // customer-facing conversation should be able to trigger.
    Task<OrderFulfillmentResult> MarkOrderFulfilledAsync(Guid businessId, Guid orderId, Guid? decidedBy, CancellationToken cancellationToken = default);
}
