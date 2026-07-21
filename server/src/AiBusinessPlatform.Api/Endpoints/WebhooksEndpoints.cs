using AiBusinessPlatform.Application.Abstractions;

namespace AiBusinessPlatform.Api.Endpoints;

public static class WebhooksEndpoints
{
    public static void MapWebhookEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/webhooks");

        // Meta's Cloud API verification handshake (Section 13.1).
        // TODO: verify hub.verify_token against the business's WhatsAppConnection (Section 9, 13).
        group.MapGet("/whatsapp", (HttpRequest request) =>
        {
            var challenge = request.Query["hub.challenge"].FirstOrDefault();
            return challenge is not null ? Results.Text(challenge) : Results.BadRequest();
        });

        group.MapPost("/whatsapp", async (HttpRequest request, IQueuePublisher queuePublisher, ILoggerFactory loggerFactory, CancellationToken cancellationToken) =>
        {
            var logger = loggerFactory.CreateLogger("WhatsAppWebhook");
            using var reader = new StreamReader(request.Body);
            var payload = await reader.ReadToEndAsync(cancellationToken);
            logger.LogInformation("Received WhatsApp webhook payload ({Length} bytes)", payload.Length);

            // TODO: verify Meta's webhook signature (Section 9.3, 15) before trusting this payload.
            await queuePublisher.PublishAsync("whatsapp.inbound", payload, cancellationToken);
            return Results.Ok();
        });

        group.MapPost("/payments/{provider}", async (string provider, HttpRequest request, IQueuePublisher queuePublisher, ILoggerFactory loggerFactory, CancellationToken cancellationToken) =>
        {
            var logger = loggerFactory.CreateLogger("PaymentWebhook");
            using var reader = new StreamReader(request.Body);
            var payload = await reader.ReadToEndAsync(cancellationToken);
            logger.LogInformation("Received {Provider} payment webhook payload ({Length} bytes)", provider, payload.Length);

            // TODO: verify provider signature/credentials (Section 13.2, 15) before trusting this payload.
            await queuePublisher.PublishAsync($"payments.{provider}.inbound", payload, cancellationToken);
            return Results.Ok();
        });
    }
}
