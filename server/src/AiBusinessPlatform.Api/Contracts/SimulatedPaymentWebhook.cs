namespace AiBusinessPlatform.Api.Contracts;

// STAND-IN for a real Paynow payment webhook payload (Section 13.2) until that integration
// exists. Posted to /webhooks/payments/manual for local testing. Only Status == "confirmed" is
// acted on this pass — any other value is logged and acked, not a full failure-path
// implementation (known gap, follow-up pass).
public record SimulatedPaymentWebhook(Guid OrderId, string ProviderReference, string Status);
