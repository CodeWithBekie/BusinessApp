# WhatsApp/

The real Meta Graph API HTTP client and outbound message/retry persistence. Raw webhook signature
verification and inbound payload parsing live in `Application/WhatsApp/` instead (pure logic, no DB
dependency) — this folder is the concrete client wiring plus everything stateful.

- **`WhatsAppOptions.cs`** — `GraphApiVersion` (default `v21.0` — Meta deprecates versions roughly
  twice a year, worth checking if sends start failing), single app-level `WebhookVerifyToken`/
  `AppSecret` (not per-connection — set via `dotnet user-secrets`).
- **`WhatsAppGraphClient.cs`** — the `IWhatsAppSender` implementation. POSTs to
  `{GraphApiVersion}/{phoneNumberId}/messages` with a **per-call** `Authorization: Bearer
  {systemUserToken}` header (deliberately not a default header on the shared `HttpClient`, since
  each business has its own token). Throws `WhatsAppSendException` on a non-2xx response or a
  missing message id.
- **`WhatsAppMessageService.cs`** — the `IWhatsAppMessageService` implementation, the single
  choke point for sending a message: resolves/creates the customer's open `Conversation`, creates
  a `Pending` `Message` row, looks up the business's `Active` `WhatsAppConnection` (fails
  terminally, no retry, if none exists), attempts the send, and on failure computes
  `NextAttemptAt` via a fixed backoff schedule (attempt 1 → +2min, 2 → +10min, 3 → +30min, 4th
  failure → terminal, no more retries). `RetryMessageAsync` re-attempts an existing `Failed` row in
  place — it assumes the caller has already set tenant context via `ICurrentTenantSetter` (the
  caller is `Api/Orchestrator/WhatsAppRetryHostedService.cs`, a queue-less consumer with no
  `HttpContext` of its own).

## Debugging a WhatsApp send failure

Check `Message.Status`/`AttemptCount`/`LastError`/`NextAttemptAt` on the specific message row —
`LastError` has the actual Graph API error text. If every send for a business fails immediately
with no retry attempted at all, check whether that business actually has an `Active`
`WhatsAppConnection` first (a `Pending`/`Disabled` connection also produces the same
no-retry-terminal-failure).
