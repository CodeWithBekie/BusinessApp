# Payments/

The real Paynow Express Checkout (mobile money/EcoCash) HTTP integration.

- **`PaynowOptions.cs`** — `BaseUrl` (default `https://www.paynow.co.zw`), `PublicBaseUrl` (this
  app's own externally-reachable origin, used to build the `resulturl`/`returnurl` Paynow calls
  back to — a localhost dev value won't actually be reachable by Paynow's servers; this is a known,
  accepted local-dev limitation, not a bug).
- **`PaynowRequestException.cs`** — carries the raw response body for diagnostics.
- **`PaynowClient.cs`** — the real `IPaynowClient` implementation. Builds the outbound field list
  in the **exact order** Paynow's own PHP SDK uses — order matters, because the hash covers
  concatenated field values in that order (see `Application/Payments/PaynowHashUtil.cs`):
  `resulturl, returnurl, reference, amount, id, additionalinfo, authemail, status, phone, method`.
  Computes and appends the hash, POSTs form-urlencoded to `/interface/remotetransaction`. Every
  response (initiate and poll) is hash-verified before being trusted; a non-2xx status or a failed
  hash check throws `PaynowRequestException`. Registered with `AddStandardResilienceHandler()` in
  `Program.cs` for transient-failure retry at the HTTP-client level.

## Debugging a payment issue

Cross-reference `Payment.ProviderReference` (the idempotency key, unique-indexed — also what
Paynow support will ask for) and `Payment.ExternalReference`/`PollUrl` (Paynow's own reference and
status-poll URL, both null until a real Paynow call has actually succeeded — still null means no
real Paynow attempt was ever made, which is expected if the business has no `PaynowConnection`
configured at all).

A business must have connected Paynow (`PaynowConnection` row, via the Settings screen /
`POST /api/payments/connect`) before any real charge attempt happens — without one, payment
requests fall back to a manual/offline reference stand-in with no real gateway call.
