using System.Text.Json;
using AiBusinessPlatform.Api.Contracts;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.WhatsApp;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Infrastructure.Data;
using AiBusinessPlatform.Infrastructure.WhatsApp;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AiBusinessPlatform.Api.Endpoints;

public static class WebhooksEndpoints
{
    public static void MapWebhookEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/webhooks");

        // Meta's Cloud API verification handshake (Section 13.1). hub.verify_token is a single
        // app-level secret configured once in Meta's App Dashboard when subscribing the webhook —
        // NOT per-WhatsAppConnection (the request carries no business-identifying information at
        // all, which independently confirms this).
        group.MapGet("/whatsapp", (HttpRequest request, IOptions<WhatsAppOptions> whatsAppOptions) =>
        {
            var mode = request.Query["hub.mode"].FirstOrDefault();
            var token = request.Query["hub.verify_token"].FirstOrDefault();
            var challenge = request.Query["hub.challenge"].FirstOrDefault();

            if (mode != "subscribe" || token != whatsAppOptions.Value.WebhookVerifyToken || challenge is null)
            {
                return Results.StatusCode(StatusCodes.Status403Forbidden);
            }

            return Results.Text(challenge);
        });

        // Real Meta webhook delivery (Section 13.1). Reads raw bytes first (needed for signature
        // verification before any deserialization), resolves the owning business from the
        // payload's phone_number_id (Section 14 — "the ingress endpoint resolves tenant identity
        // directly from the receiving number"), and publishes the resolved WhatsAppInboundQueueMessage.
        group.MapPost("/whatsapp", async (
            HttpRequest request, IQueuePublisher queuePublisher, AiBusinessPlatformDbContext db,
            IOptions<WhatsAppOptions> whatsAppOptions, ILoggerFactory loggerFactory, CancellationToken cancellationToken) =>
        {
            var logger = loggerFactory.CreateLogger("WhatsAppWebhook");

            using var bodyStream = new MemoryStream();
            await request.Body.CopyToAsync(bodyStream, cancellationToken);
            var rawBody = bodyStream.ToArray();

            if (!MetaWebhookSignatureVerifier.IsValid(rawBody, request.Headers["X-Hub-Signature-256"], whatsAppOptions.Value.AppSecret))
            {
                logger.LogWarning("Rejected WhatsApp webhook: invalid or missing X-Hub-Signature-256.");
                return Results.Unauthorized();
            }

            MetaWebhookPayload? payload;
            try
            {
                payload = JsonSerializer.Deserialize<MetaWebhookPayload>(rawBody);
            }
            catch (JsonException ex)
            {
                logger.LogWarning(ex, "Could not parse WhatsApp webhook payload.");
                return Results.Ok(); // Meta requires a fast 200 regardless; nothing a retry would fix here.
            }

            if (payload is null)
            {
                return Results.Ok();
            }

            var parsed = MetaWebhookPayloadParser.TryParseFirstTextMessage(payload, out var multipleMessagesFound);
            if (multipleMessagesFound)
            {
                logger.LogWarning("WhatsApp webhook payload contained more than one message — only the first text message is processed this pass.");
            }

            if (parsed is null)
            {
                logger.LogInformation("WhatsApp webhook contained no supported (text) message — ignoring.");
                return Results.Ok();
            }

            // Pre-tenant lookup: no tenant is resolved yet at this point, so the normal
            // tenant-filtered query would silently only ever match the ambient default tenant.
            var connection = await db.WhatsAppConnections
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(c => c.PhoneNumberId == parsed.PhoneNumberId, cancellationToken);

            if (connection is null || connection.Status != WhatsAppConnectionStatus.Active)
            {
                logger.LogWarning("WhatsApp webhook for unknown or inactive phone_number_id {PhoneNumberId} — ignoring.", parsed.PhoneNumberId);
                return Results.Ok();
            }

            var envelope = new WhatsAppInboundQueueMessage(connection.BusinessId, parsed.CustomerWaId, parsed.Text, parsed.MessageId);
            await queuePublisher.PublishAsync("whatsapp.inbound", JsonSerializer.Serialize(envelope), cancellationToken);
            return Results.Ok();
        });

        // Body shape is SimulatedWhatsAppMessage — a stand-in for a real Meta webhook payload,
        // kept working unchanged for local testing without a real Meta account. Resolves
        // BusinessId via the same ICurrentTenantProvider every dashboard endpoint uses (the
        // authenticated caller's own business_id claim), then publishes the same envelope the real
        // path above uses. Requires auth — unlike the real Meta/payment webhooks, this endpoint
        // triggers the flow "as" whichever business the caller is authenticated for, so it can't
        // be left open the way a real signature-verified webhook can.
        group.MapPost("/whatsapp/simulate", async (
            HttpRequest request, IQueuePublisher queuePublisher, ICurrentTenantProvider tenantProvider,
            ILoggerFactory loggerFactory, CancellationToken cancellationToken) =>
        {
            var logger = loggerFactory.CreateLogger("WhatsAppWebhook");

            var simulated = await request.ReadFromJsonAsync<SimulatedWhatsAppMessage>(cancellationToken);
            if (simulated is null || string.IsNullOrWhiteSpace(simulated.CustomerNumber) || string.IsNullOrWhiteSpace(simulated.Text))
            {
                return Results.BadRequest("Expected { customerNumber, text } — stand-in for a real Meta payload (Section 13.1).");
            }

            logger.LogInformation("Received simulated WhatsApp message from {CustomerNumber}", simulated.CustomerNumber);

            var envelope = new WhatsAppInboundQueueMessage(tenantProvider.CurrentBusinessId, simulated.CustomerNumber, simulated.Text, null);
            await queuePublisher.PublishAsync("whatsapp.inbound", JsonSerializer.Serialize(envelope), cancellationToken);
            return Results.Ok();
        }).RequireAuthorization();

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
