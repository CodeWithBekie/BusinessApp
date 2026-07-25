namespace AiBusinessPlatform.Application.Abstractions;

public record SendWhatsAppMessageResult(bool Success, string? ErrorMessage);

// The one place that resolves a business's active WhatsAppConnection, sends via IWhatsAppSender,
// and persists the outbound Message (with retry-scheduling on failure) — every call site that
// sends a WhatsApp message to a customer (the AI orchestrator's reply, an approved
// draft_customer_message, deterministic receipts/cancellation notices) goes through this instead
// of duplicating the connection-lookup + send logic or skipping the real send entirely.
public interface IWhatsAppMessageService
{
    Task<SendWhatsAppMessageResult> SendAsync(Guid businessId, Guid customerId, string text, CancellationToken cancellationToken = default);

    // Re-attempts an existing Failed Message row in place (updates it, doesn't create a new one).
    // Used only by WhatsAppRetryHostedService, once per due message, with the tenant context
    // already set to that message's business.
    Task RetryMessageAsync(Guid messageId, CancellationToken cancellationToken = default);
}
