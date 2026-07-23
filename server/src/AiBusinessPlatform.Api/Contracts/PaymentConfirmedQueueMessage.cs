namespace AiBusinessPlatform.Api.Contracts;

// The payments.confirmed queue wire format — both the simulated /webhooks/payments/manual path and
// the real /webhooks/payments/paynow path resolve BusinessId themselves (Section 9.3: "tenant
// context is loaded, never inferred") before publishing, so PaymentWebhookConsumer never has to
// guess which business a confirmation belongs to.
public record PaymentConfirmedQueueMessage(Guid BusinessId, Guid OrderId);
