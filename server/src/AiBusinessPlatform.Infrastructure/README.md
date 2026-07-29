# AiBusinessPlatform.Infrastructure

Real implementations of every `Application` interface — EF Core, HTTP clients, RabbitMQ. This
project references both `Domain` and `Application`; nothing outside `Infrastructure` should ever
new up one of these classes directly — always resolve through the `Application` interface via DI.

## Subfolders

- **`AI/`** — LM Studio chat/embedding client setup (`Microsoft.Extensions.AI`, `IChatClient`).
- **`Auth/`** — the real JWT/tenant-resolution/permission-check implementation, shared by `Api`
  and `Mcp`.
- **`Data/`** — `AiBusinessPlatformDbContext` (the multi-tenancy mechanism), EF configurations,
  migrations.
- **`Ledger/`** — the double-entry bookkeeping engine.
- **`Messaging/`** — the generic RabbitMQ queue-publisher abstraction (not WhatsApp-specific —
  see `WhatsApp/` for that).
- **`Payments/`** — the real Paynow Express Checkout HTTP client.
- **`Tools/`** — one class per `Application/Tools` interface — see its own README.
- **`WhatsApp/`** — the real Meta Graph API HTTP client and outbound message/retry persistence.

## The DI registration pattern

Both `Api/Program.cs` and `Mcp/Program.cs` register the same set of implementations — one
`AddScoped<IX, X>()` line per interface. The one deliberate exception:
`HttpBusinessIdTenantProvider` (`Auth/`) is registered **once**, then forwarded to four different
interfaces (`ICurrentTenantProvider`, `ICurrentTenantSetter`, `ICurrentUserProvider`,
`ICurrentUserRoleProvider`) via `sp => sp.GetRequiredService<HttpBusinessIdTenantProvider>()`. This
is required, not stylistic — a background queue consumer calls `ICurrentTenantSetter.SetBusinessId()`
to push tenant context, and other scoped services then read it back via `ICurrentTenantProvider`
from *the same instance*. Registering each interface with its own separate `AddScoped<T>()` would
silently break this (each would resolve a different instance, and the setter's value would never
be visible to the provider).
