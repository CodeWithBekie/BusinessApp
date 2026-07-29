# Orchestrator/

The WhatsApp order-taking AI agent, running as an in-process background worker (not a separate
deployable process).

## Files

- **`WhatsAppOrchestratorConsumer.cs`** — a `BackgroundService` that connects to RabbitMQ (with
  exponential backoff reconnect, 1s→30s capped) and consumes the durable queue
  **`whatsapp.inbound`** (published by `../Endpoints/WebhooksEndpoints.cs`). For each message it:
  resolves/creates the `Customer` and their open `Conversation`, persists the inbound message,
  rebuilds the full chat history, builds a small set of `AIFunctionFactory` tools bound to the
  *current* customer/tenant context (`check_catalog_availability`, `reserve_stock`,
  `release_stock_reservation`, `create_invoice`, `request_order_cancellation`,
  `search_business_documents`), calls the model, sends the reply via `IWhatsAppMessageService`, and
  ACKs the delivery. Duplicate/redelivered messages (checked by `WhatsAppMessageId`) are ACKed
  without reprocessing.
- **`WhatsAppRetryHostedService.cs`** — polls every 60 seconds for outbound `Message` rows with
  `Status == Failed` and `NextAttemptAt <= now` (across every tenant), and retries each one under
  its own tenant scope.

Both follow the same shape: connect-with-backoff, and a top-level try/catch that only logs — a
processing exception never crashes the whole `Api` host, it just drops that one message (there's
no dead-letter queue yet; this is a known, accepted gap).

## The one important safety rule

The model is only ever given free-text/ids/quantities to work with — `businessId` and `customerId`
are always resolved from the ambient tenant/conversation context server-side, **never** supplied
by (or trusted from) the model itself. Don't loosen this when adding a new tool here.

## Testing/debugging

Needs RabbitMQ running and LM Studio running (for the chat model). Simulate a message without a
real WhatsApp number:

```bash
curl -X POST http://localhost:5151/webhooks/whatsapp/simulate -H "Authorization: Bearer <business token>" \
  -H "Content-Type: application/json" -d '{"customerNumber":"+263771234567","text":"do you have cement?"}'
```

Watch the `Api` console for `"Listening on RabbitMQ queue 'whatsapp.inbound'"` at startup, then
`[tool call]`/`[tool result]` log lines as the message is processed. If it seems stuck, check the
RabbitMQ management UI (`http://localhost:15673`, see `infra/README.md`) for queue depth.

For faster iteration on the system prompt/tool set without needing RabbitMQ or webhook plumbing at
all, use `server/tools/AiBusinessPlatform.OrchestratorHarness` instead — a console REPL wrapping
the exact same tool-calling logic.
