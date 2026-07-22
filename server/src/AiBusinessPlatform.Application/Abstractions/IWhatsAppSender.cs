namespace AiBusinessPlatform.Application.Abstractions;

public record SendTextMessageResult(string WhatsAppMessageId);

// Section 13.1 — sends an outbound text message via the WhatsApp Cloud API (Graph API).
public interface IWhatsAppSender
{
    Task<SendTextMessageResult> SendTextMessageAsync(
        string phoneNumberId, string systemUserToken, string toWaId, string text, CancellationToken cancellationToken = default);
}
