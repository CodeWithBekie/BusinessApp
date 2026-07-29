# Payments/

The payment-confirmation background worker.

## File

**`PaymentWebhookConsumer.cs`** — a `BackgroundService`, structurally identical to
`../Orchestrator/WhatsAppOrchestratorConsumer.cs` (same connect-with-backoff, same
try/catch-everything shape). Listens on durable queue **`payments.confirmed`**, published by
`../Endpoints/WebhooksEndpoints.cs` — both the dev-simulate route (`/webhooks/payments/manual`)
and the real Paynow webhook (`/webhooks/payments/paynow`) publish to this same queue, each
resolving `BusinessId` itself before publishing. This consumer just sets tenant context and calls
`IOrderTools.ConfirmPaymentAsync(businessId, orderId)` — no dead-letter queue (same accepted gap
as the WhatsApp consumer: a processing failure drops the message rather than requeue-looping).

## Testing/debugging

Needs RabbitMQ running.

```bash
# create an order first (POS sale, WhatsApp flow, or marketplace checkout), then:
curl -X POST http://localhost:5151/webhooks/payments/manual -H "Content-Type: application/json" \
  -d '{"orderId":"<order id>","providerReference":"test-ref","status":"confirmed"}'
```

No auth required — tenant is resolved from the `Order` row itself. Watch the console for
`[payment confirmed] order=... payment=... orderStatus=... paymentStatus=...`.
