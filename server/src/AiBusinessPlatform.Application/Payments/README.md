# Payments/

Real Paynow wire-format mechanics — pure, static, no DB or HTTP dependency, directly unit-tested
in `server/tests/AiBusinessPlatform.Application.Tests/`. Distinct from `../Tools/IPaymentTools.cs`,
which is the abstract "create a payment request against whatever aggregator is configured"
business contract; this folder holds the concrete Paynow-specific math that contract's real
implementation (`Infrastructure/Payments/PaynowClient.cs`) relies on.

- **`PaynowHashUtil.cs`** — `ComputeHash`/`Verify`: concatenate every field *value* (not key) in
  wire order, skipping any field literally named `"hash"`, append the lowercased integration key,
  SHA-512, uppercase hex. Verification uses a constant-time comparison. Matches Paynow's own PHP
  SDK exactly (verified against SDK source, since Paynow's public docs site blocks automated
  fetches).
- **`PaynowFormCodec.cs`** — hand-rolled `application/x-www-form-urlencoded` parse/encode that
  preserves field order. This matters because hash verification depends on the exact wire order —
  ASP.NET Core's built-in `IFormCollection` does **not** guarantee order, so it can't be used here.

If a Paynow payment is failing hash verification, this is the first place to look — reproduce the
exact field order/values Paynow's dashboard shows against what `PaynowClient.cs` sent.
