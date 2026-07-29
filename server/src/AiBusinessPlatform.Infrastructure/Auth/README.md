# Auth/

The real JWT authentication and tenant/permission resolution implementation — shared identically
by `Api` and `Mcp` (both call `AddPlatformJwtAuthentication` from here, so a token issued by `Api`
validates directly against `Mcp` with no shared session store, just a shared signing key).

- **`JwtOptions.cs`** — `SigningKey`/`Issuer`/`Audience`/`ExpiryMinutes` (default 1440 min = 24h).
  `SigningKey` must come from `dotnet user-secrets`, never `appsettings.json` — and must be
  identical between `Api` and `Mcp`, or tokens issued by one won't validate on the other.
- **`JwtAuthenticationExtensions.cs`** — `AddPlatformJwtAuthentication(configuration)`. Sets
  `options.MapInboundClaims = false` — **don't remove this**: without it, ASP.NET Core remaps
  short claim names like `"sub"` to legacy long-form URIs, and every claim lookup by short name
  elsewhere in the codebase would silently start failing. Registers `"CustomerOnly"` (requires a
  `customer_account_id` claim), `"BusinessOnly"` (requires `business_id`), and one
  `"Permission:{X}"` policy per `Permission` enum value.
- **`PermissionAuthorizationHandler.cs`** — the REST-layer enforcement point: a pure claims read
  (no DB), resolves the role claim and asks `Application/Auth/RolePermissions.Has(...)`.
- **`PermissionChecker.cs`** — the MCP-layer twin (`IPermissionChecker`), called manually by every
  mutating MCP tool since MCP calls bypass ASP.NET Core's authorization pipeline.
- **`HttpBusinessIdTenantProvider.cs`** — implements four interfaces at once
  (`ICurrentTenantProvider`/`ICurrentTenantSetter`/`ICurrentUserProvider`/`ICurrentUserRoleProvider`);
  see `Infrastructure/README.md` for why it's registered once and forwarded, not registered per
  interface. `CurrentBusinessId` **throws** if no valid `business_id` claim is present — that's
  read as "a route forgot `[Authorize]`," not a legitimate no-tenant state. Supports an explicit
  override (`SetBusinessId`) used by background consumers that have no `HttpContext`.
- **`HttpCustomerAccountProvider.cs`** — the customer-side equivalent; reads `customer_account_id`
  and returns `null` rather than throwing (no-customer *is* legitimate here, e.g. anonymous
  marketplace browsing).

## Debugging auth issues

A JWT's `role` claim drives every permission check — there's **no DB round-trip per request**.
Practical consequence: changing a staff member's role, or deactivating them, does not affect an
already-issued token; it only takes effect at their next login or when the token expires
(`ExpiryMinutes`). If a permission change "isn't working," check whether the test session is using
a stale token before assuming the server-side change is wrong. Also: `CustomerOnly` and
`BusinessOnly` are genuinely different token types with different claims — a customer token will
never satisfy a `BusinessOnly` route, by design.
