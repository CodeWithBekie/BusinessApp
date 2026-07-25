using System.Text.Json;
using AiBusinessPlatform.Api.Contracts;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Payments;
using AiBusinessPlatform.Application.WhatsApp;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Infrastructure.Data;
using AiBusinessPlatform.Infrastructure.WhatsApp;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
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

            // Independent of the inbound-message handling below — a pure status-callback payload
            // (the common case) has no messages array at all, so this must not be gated behind the
            // "no supported message found" early-return further down.
            await ApplyStatusUpdatesAsync(payload, db, logger, cancellationToken);

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
        }).RequireAuthorization("BusinessOnly");

        // Body shape is SimulatedPaymentWebhook — a stand-in for a real Paynow webhook payload,
        // kept working unchanged for local testing without a real Paynow account. Resolves
        // BusinessId via the Order the envelope names (Orders always carry BusinessId), then
        // publishes the same PaymentConfirmedQueueMessage the real path below uses.
        group.MapPost("/payments/manual", async (
            HttpRequest request, IQueuePublisher queuePublisher, AiBusinessPlatformDbContext db,
            ILoggerFactory loggerFactory, CancellationToken cancellationToken) =>
        {
            var logger = loggerFactory.CreateLogger("PaymentWebhook");

            var simulated = await request.ReadFromJsonAsync<SimulatedPaymentWebhook>(cancellationToken);
            if (simulated is null || simulated.OrderId == Guid.Empty || string.IsNullOrWhiteSpace(simulated.Status))
            {
                return Results.BadRequest("Expected { orderId, providerReference, status } — stand-in for a real Paynow payload (Section 13.2).");
            }

            logger.LogInformation("Received manual payment webhook for order {OrderId} (status: {Status})", simulated.OrderId, simulated.Status);

            if (!string.Equals(simulated.Status, "confirmed", StringComparison.OrdinalIgnoreCase))
            {
                // Only the confirmed path is implemented this pass (known gap, follow-up pass).
                logger.LogWarning("Manual payment webhook status '{Status}' is not handled — ignoring.", simulated.Status);
                return Results.Ok();
            }

            // Pre-tenant lookup: no tenant is resolved yet at this point.
            var order = await db.Orders.IgnoreQueryFilters().FirstOrDefaultAsync(o => o.Id == simulated.OrderId, cancellationToken);
            if (order is null)
            {
                logger.LogWarning("Manual payment webhook for unknown order {OrderId} — ignoring.", simulated.OrderId);
                return Results.Ok();
            }

            var envelope = new PaymentConfirmedQueueMessage(order.BusinessId, order.Id);
            await queuePublisher.PublishAsync("payments.confirmed", JsonSerializer.Serialize(envelope), cancellationToken);
            return Results.Ok();
        });

        // Real Paynow webhook delivery (Section 13.2). Paynow's wire format is
        // application/x-www-form-urlencoded, not JSON, on both this callback and the poll
        // response. The webhook carries no business-identifying field directly — only our own
        // merchant `reference` — so the Payment row it names is looked up first (harmless; the
        // reference isn't secret), and ONLY THEN is the hash verified using that business's own
        // PaynowConnection.IntegrationKey, which remains the actual trust gate before anything is
        // acted on.
        group.MapPost("/payments/paynow", async (
            HttpRequest request, IQueuePublisher queuePublisher, AiBusinessPlatformDbContext db,
            ILoggerFactory loggerFactory, CancellationToken cancellationToken) =>
        {
            var logger = loggerFactory.CreateLogger("PaymentWebhook");

            using var reader = new StreamReader(request.Body);
            var rawBody = await reader.ReadToEndAsync(cancellationToken);
            var fields = PaynowFormCodec.ParseOrdered(rawBody);

            var reference = fields.FirstOrDefault(f => string.Equals(f.Key, "reference", StringComparison.OrdinalIgnoreCase)).Value;
            if (string.IsNullOrEmpty(reference))
            {
                logger.LogWarning("Paynow webhook had no reference field — ignoring.");
                return Results.Ok();
            }

            // Pre-tenant lookup: which business this belongs to is exactly what we're resolving.
            var payment = await db.Payments.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.ProviderReference == reference, cancellationToken);
            if (payment is null)
            {
                logger.LogWarning("Paynow webhook for unknown reference {Reference} — ignoring.", reference);
                return Results.Ok();
            }

            var connection = await db.PaynowConnections.IgnoreQueryFilters().FirstOrDefaultAsync(c => c.BusinessId == payment.BusinessId, cancellationToken);
            if (connection is null || !PaynowHashUtil.Verify(fields, connection.IntegrationKey))
            {
                logger.LogWarning("Rejected Paynow webhook for reference {Reference}: invalid or missing hash.", reference);
                return Results.Unauthorized();
            }

            var status = fields.FirstOrDefault(f => string.Equals(f.Key, "status", StringComparison.OrdinalIgnoreCase)).Value;
            if (!string.Equals(status, "paid", StringComparison.OrdinalIgnoreCase))
            {
                // Other terminal statuses (Cancelled, Created, Awaiting Delivery, etc.) aren't
                // reflected back onto the Payment/Order yet — known gap, follow-up pass.
                logger.LogInformation("Paynow webhook status '{Status}' for reference {Reference} is not handled — ignoring.", status, reference);
                return Results.Ok();
            }

            var envelope = new PaymentConfirmedQueueMessage(connection.BusinessId, payment.OrderId);
            await queuePublisher.PublishAsync("payments.confirmed", JsonSerializer.Serialize(envelope), cancellationToken);
            return Results.Ok();
        });
    }

    // Delivery/read status tracking for outbound sends — updates the Message row IWhatsAppMessageService
    // already created (matched by WhatsAppMessageId/wamid) rather than creating anything new.
    private static async Task ApplyStatusUpdatesAsync(MetaWebhookPayload payload, AiBusinessPlatformDbContext db, ILogger logger, CancellationToken cancellationToken)
    {
        var statusUpdates = MetaWebhookPayloadParser.ExtractStatusUpdates(payload);
        if (statusUpdates.Count == 0)
        {
            return;
        }

        foreach (var status in statusUpdates)
        {
            // Pre-tenant lookup: business isn't known up front — the wamid alone identifies the row.
            var message = await db.Messages.IgnoreQueryFilters().FirstOrDefaultAsync(m => m.WhatsAppMessageId == status.Id, cancellationToken);
            if (message is null)
            {
                logger.LogInformation("WhatsApp status update for unknown wamid {WamId} — ignoring.", status.Id);
                continue;
            }

            switch (status.Status.ToLowerInvariant())
            {
                case "delivered":
                    message.Status = MessageDeliveryStatus.Delivered;
                    message.DeliveredAt = ParseUnixTimestamp(status.Timestamp) ?? DateTimeOffset.UtcNow;
                    break;
                case "read":
                    message.Status = MessageDeliveryStatus.Read;
                    message.ReadAt = ParseUnixTimestamp(status.Timestamp) ?? DateTimeOffset.UtcNow;
                    break;
                case "failed":
                    // A Meta-reported async failure (e.g. invalid/opted-out number) isn't the kind
                    // of transient failure our own send-side retry logic should re-attempt —
                    // NextAttemptAt stays null (terminal), unlike an our-side send exception.
                    message.Status = MessageDeliveryStatus.Failed;
                    message.LastError = status.Errors?.FirstOrDefault()?.Message ?? "Meta reported this message failed to deliver.";
                    message.NextAttemptAt = null;
                    break;
                case "sent":
                    // Already set at send time by IWhatsAppMessageService — only reaffirm if this
                    // somehow arrived before that (out-of-order delivery).
                    if (message.Status == MessageDeliveryStatus.Pending)
                    {
                        message.Status = MessageDeliveryStatus.Sent;
                    }
                    break;
                default:
                    logger.LogInformation("Unrecognized WhatsApp status '{Status}' for wamid {WamId} — ignoring.", status.Status, status.Id);
                    break;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private static DateTimeOffset? ParseUnixTimestamp(string? unixSeconds) =>
        long.TryParse(unixSeconds, out var seconds) ? DateTimeOffset.FromUnixTimeSeconds(seconds) : null;
}
