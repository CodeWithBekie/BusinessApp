using System.ComponentModel;

namespace AiBusinessPlatform.Application.Tools;

// Instructions/PollUrl are null when no PaynowConnection is configured for the business yet
// (manual/offline reference stand-in) — non-null once a real Paynow Express Checkout transaction
// was initiated.
public record PaymentRequestResult(string PaymentReference, string? Instructions = null, string? PollUrl = null);

public record PaymentStatusResult(string PaymentReference, string Status);

// Section 10.3/12.4/13.2 — real implementation targets a payment aggregator (e.g. Paynow) in a later phase.
public interface IPaymentTools
{
    [Description("Creates a payment request against the connected payment aggregator for an order.")]
    Task<PaymentRequestResult> CreatePaymentRequestAsync(Guid businessId, Guid orderId, decimal amount, string currency, string customerNumber, CancellationToken cancellationToken = default);

    [Description("Gets the current status of a previously created payment request.")]
    Task<PaymentStatusResult> GetPaymentStatusAsync(string paymentReference, CancellationToken cancellationToken = default);
}
