using System.Text.Json;
using AiBusinessPlatform.Api.Contracts;
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

        // Body shape is SimulatedWhatsAppMessage — a stand-in for a real Meta webhook payload
        // (Section 13.1) until that integration is built; the queue contract below is designed
        // so a future real-payload parser can keep publishing this same envelope.
        group.MapPost("/whatsapp", async (HttpRequest request, IQueuePublisher queuePublisher, ILoggerFactory loggerFactory, CancellationToken cancellationToken) =>
        {
            var logger = loggerFactory.CreateLogger("WhatsAppWebhook");

            var envelope = await request.ReadFromJsonAsync<SimulatedWhatsAppMessage>(cancellationToken);
            if (envelope is null || string.IsNullOrWhiteSpace(envelope.CustomerNumber) || string.IsNullOrWhiteSpace(envelope.Text))
            {
                return Results.BadRequest("Expected { customerNumber, text } — stand-in for a real Meta payload (Section 13.1).");
            }

            logger.LogInformation("Received simulated WhatsApp message from {CustomerNumber}", envelope.CustomerNumber);

            // TODO: verify Meta's webhook signature (Section 9.3, 15) before trusting this payload.
            await queuePublisher.PublishAsync("whatsapp.inbound", JsonSerializer.Serialize(envelope), cancellationToken);
            return Results.Ok();
        });

        // Body shape is SimulatedPaymentWebhook — a stand-in for a real Paynow webhook payload
        // (Section 13.2) until that integration is built. Hit with provider = "manual" for local
        // testing; PaymentWebhookConsumer consumes payments.manual.inbound.
        group.MapPost("/payments/{provider}", async (string provider, HttpRequest request, IQueuePublisher queuePublisher, ILoggerFactory loggerFactory, CancellationToken cancellationToken) =>
        {
            var logger = loggerFactory.CreateLogger("PaymentWebhook");

            var envelope = await request.ReadFromJsonAsync<SimulatedPaymentWebhook>(cancellationToken);
            if (envelope is null || envelope.OrderId == Guid.Empty || string.IsNullOrWhiteSpace(envelope.Status))
            {
                return Results.BadRequest("Expected { orderId, providerReference, status } — stand-in for a real Paynow payload (Section 13.2).");
            }

            logger.LogInformation("Received {Provider} payment webhook for order {OrderId} (status: {Status})", provider, envelope.OrderId, envelope.Status);

            // TODO: verify provider signature/credentials (Section 13.2, 15) before trusting this payload.
            await queuePublisher.PublishAsync($"payments.{provider}.inbound", JsonSerializer.Serialize(envelope), cancellationToken);
            return Results.Ok();
        });
    }
}
