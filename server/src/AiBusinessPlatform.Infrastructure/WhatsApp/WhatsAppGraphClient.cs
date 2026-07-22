using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using AiBusinessPlatform.Application.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AiBusinessPlatform.Infrastructure.WhatsApp;

// Section 13.1 — real outbound send via Meta's WhatsApp Cloud API (Graph API). Request/response
// shapes match Meta's official documentation/Postman collection for the text-message send call —
// the single most stable, most-documented Cloud API call.
public class WhatsAppGraphClient(HttpClient httpClient, IOptions<WhatsAppOptions> options, ILogger<WhatsAppGraphClient> logger) : IWhatsAppSender
{
    public async Task<SendTextMessageResult> SendTextMessageAsync(
        string phoneNumberId, string systemUserToken, string toWaId, string text, CancellationToken cancellationToken = default)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"{options.Value.GraphApiVersion}/{phoneNumberId}/messages")
        {
            Content = JsonContent.Create(new
            {
                messaging_product = "whatsapp",
                recipient_type = "individual",
                to = toWaId,
                type = "text",
                text = new { preview_url = false, body = text }
            })
        };

        // Per-call, not a default header on the shared HttpClient — the system user token differs
        // per business (each business has its own WhatsAppConnection.SystemUserToken).
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", systemUserToken);

        var response = await httpClient.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            logger.LogError("WhatsApp Graph API send failed ({Status}): {Body}", response.StatusCode, body);
            throw new WhatsAppSendException($"Graph API returned {response.StatusCode}", body);
        }

        var parsed = JsonSerializer.Deserialize<MetaSendMessageResponse>(body);
        var messageId = parsed?.Messages?.FirstOrDefault()?.Id
            ?? throw new WhatsAppSendException("Graph API returned success but no message id was found in the response.", body);

        return new SendTextMessageResult(messageId);
    }
}
