# Messaging/

The generic RabbitMQ queue-publisher abstraction — not WhatsApp-specific (that lives in
`../WhatsApp/`), just the raw "publish this payload to this queue" mechanism used by both the
WhatsApp inbound flow and the payment-confirmation flow.

- **`RabbitMqOptions.cs`** — host/port/credentials (dev host port 5673, see `infra/README.md` for
  why it's remapped).
- **`RabbitMqQueuePublisher.cs`** — the `IQueuePublisher` implementation. Lazily creates a
  connection/channel guarded by a `SemaphoreSlim`, and declares the target queue durable at publish
  time (so publishing to a not-yet-existing queue just creates it).

**Note:** the actual retry-scheduling *data model* (`Message.NextAttemptAt`, `AttemptCount`,
backoff schedule) does **not** live here — that's in `../WhatsApp/WhatsAppMessageService.cs`'s
`RetryMessageAsync`/backoff logic, called by `Api/Orchestrator/WhatsAppRetryHostedService.cs`.
This folder is only the generic publish-a-message-to-a-queue primitive both the WhatsApp and
payment flows build on top of.
