# AiBusinessPlatform.Application.Tests

xUnit unit tests for the pure, framework-independent logic in
`Application/Payments/` and `Application/WhatsApp/` — the only two folders in the whole backend
with zero DB/HTTP/queue dependency, so they're the only ones covered by real automated tests today.
There are no integration or end-to-end tests in this repo; every feature verification in this
project's history has been done by running the real `Api`/`Mcp` hosts and exercising them via curl
and the mobile browser preview (see each feature area's own README for how).

## What's covered

- **`MetaWebhookPayloadParserTests.cs`** — `TryParseFirstTextMessage`: single-message extraction,
  first-of-batch handling, non-text message types return null, empty/no-message payloads return
  null.
- **`MetaWebhookSignatureVerifierTests.cs`** — `IsValid`: true for a correctly HMAC-signed body,
  false for a tampered body, wrong secret, or missing/malformed signature header.
- **`PaynowFormCodecTests.cs`** — `ParseOrdered` preserves field order, URL-decodes, treats `+` as
  space; `Encode`+`ParseOrdered` round-trips order and special characters.
- **`PaynowHashUtilTests.cs`** — `ComputeHash` matches an independently computed value and skips a
  field named `"hash"`; `Verify` catches tampering, a wrong key, and malformed hash values.

## Running

```bash
cd server
dotnet test tests/AiBusinessPlatform.Application.Tests/AiBusinessPlatform.Application.Tests.csproj
```

(or `dotnet test` from `server/` to build and test the whole solution — this project itself needs
no external services running, since it only exercises pure functions.)

## Adding a test

Only pure, dependency-free logic belongs here (this project only references `Application`). If
what you're testing needs EF Core, an `HttpClient`, or RabbitMQ, it doesn't fit this project's
constraints — there's no integration-test harness in this repo to add it to yet; verify that kind
of change by running the real hosts instead.
