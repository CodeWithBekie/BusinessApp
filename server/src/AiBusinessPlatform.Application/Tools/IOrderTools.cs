using System.ComponentModel;
using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Tools;

public record InvoiceLineItem(Guid CatalogItemId, string Name, int Quantity, decimal UnitPrice, decimal Subtotal);

public record InvoiceResult(Guid OrderId, decimal TotalAmount, string Currency, string PaymentReference, IReadOnlyList<InvoiceLineItem> LineItems);

public record PaymentConfirmationResult(Guid OrderId, Guid PaymentId, OrderStatus OrderStatus, PaymentStatus PaymentStatus);

public interface IOrderTools
{
    [Description("Creates an invoice for the customer's current open (reserved) order: computes the total from its reserved line items, transitions it to Invoiced, and creates the pending payment record the customer must pay against.")]
    Task<InvoiceResult> CreateInvoiceAsync(Guid businessId, Guid customerId, CancellationToken cancellationToken = default);

    // Deliberately never exposed as an AI tool (Section 10.5's human-in-the-loop principle
    // applied to money-received events) — only ever invoked by PaymentWebhookConsumer.
    Task<PaymentConfirmationResult> ConfirmPaymentAsync(Guid businessId, Guid orderId, CancellationToken cancellationToken = default);
}
