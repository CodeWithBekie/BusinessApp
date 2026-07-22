namespace AiBusinessPlatform.Application.WhatsApp;

public record ParsedInboundTextMessage(string PhoneNumberId, string CustomerWaId, string MessageId, string Text);

// Section 13.1 — pure parsing logic, no ASP.NET Core/DB dependency, directly unit-testable.
// Only type == "text" messages are handled this pass; other types (image, document, interactive,
// button, etc.) are skipped (known gap). A payload can in principle carry multiple entries/
// changes/messages (batching) — this pass only processes the first text message found.
public static class MetaWebhookPayloadParser
{
    public static ParsedInboundTextMessage? TryParseFirstTextMessage(MetaWebhookPayload payload, out bool multipleMessagesFound)
    {
        multipleMessagesFound = false;
        ParsedInboundTextMessage? result = null;
        var totalMessagesSeen = 0;

        foreach (var entry in payload.Entry ?? [])
        {
            foreach (var change in entry.Changes ?? [])
            {
                var value = change.Value;
                foreach (var message in value.Messages ?? [])
                {
                    totalMessagesSeen++;

                    if (result is not null)
                    {
                        continue; // already captured the first text message; keep counting for the multiple-messages flag
                    }

                    if (!string.Equals(message.Type, "text", StringComparison.OrdinalIgnoreCase) || message.Text is null)
                    {
                        continue;
                    }

                    result = new ParsedInboundTextMessage(
                        value.Metadata.PhoneNumberId,
                        message.From,
                        message.Id,
                        message.Text.Body);
                }
            }
        }

        multipleMessagesFound = totalMessagesSeen > 1;
        return result;
    }
}
