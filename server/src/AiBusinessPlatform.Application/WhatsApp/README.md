# WhatsApp/

Pure, DB-free, directly unit-testable WhatsApp Cloud API webhook handling (tested in
`server/tests/AiBusinessPlatform.Application.Tests/`).

- **`MetaWebhookPayload.cs`** — the full record-based DTO tree matching Meta's documented Cloud
  API shape (`MetaWebhookPayload → Entry → Changes → Value → {Contacts, Messages, Statuses}`).
  Unrecognized fields are silently ignored.
- **`MetaWebhookPayloadParser.cs`** — `TryParseFirstTextMessage` (only `type == "text"` is
  handled today — image/interactive/other message types are a known, accepted gap) and
  `ExtractStatusUpdates` (flattens every delivery/read/failed status callback in a batched
  webhook delivery).
- **`MetaWebhookSignatureVerifier.cs`** — HMAC-SHA256 over the **raw request body** using the
  single app-level App Secret, verified before any JSON deserialization happens, with a
  constant-time comparison (same shape as `../Payments/PaynowHashUtil.Verify`).

This is where to look first if an inbound WhatsApp message isn't being parsed correctly, or if the
real Meta webhook is 401ing (signature mismatch — check `WhatsApp:AppSecret` matches what's
configured in the Meta developer dashboard, and that nothing upstream is modifying the request
body before it reaches this verifier).
