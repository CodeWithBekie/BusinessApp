# server/

.NET 9 solution (`AiBusinessPlatform.sln`) implementing the whole backend: two deployable host
projects (`Api`, `Mcp`) sharing one set of business-logic implementations, plus a domain/contracts
core, a test project, and a standalone dev tool.

```
src/
  AiBusinessPlatform.Domain/           entities + enums, zero dependencies
  AiBusinessPlatform.Application/      interfaces/contracts only, depends on Domain only
  AiBusinessPlatform.Infrastructure/   real implementations (EF Core, HTTP clients, RabbitMQ)
  AiBusinessPlatform.Api/              REST host: mobile app backend, webhooks, background workers
  AiBusinessPlatform.Mcp/              MCP host: the same business logic exposed to AI clients
tests/
  AiBusinessPlatform.Application.Tests/  xUnit tests for pure Application-layer logic
tools/
  AiBusinessPlatform.OrchestratorHarness/  console REPL for the WhatsApp AI loop, no queue/webhook needed
```

Read each project's own `README.md` for detail. The short version of how they fit together:

**Layering is strict and one-directional:** `Domain` → `Application` → `Infrastructure`. Nothing
in `Domain` or `Application` ever references `Infrastructure`, EF Core, or any HTTP client —
`Application` is pure interfaces (`ICatalogTools`, `IOrderTools`, `IPaymentTools`, ...) and DTOs,
`Infrastructure` implements every one of them exactly once. `Api` and `Mcp` are both thin hosts
that wire up `Infrastructure`'s implementations via DI and expose them two different ways — REST
endpoints in `Api`, MCP tools/resources in `Mcp`. Business logic is never duplicated between the
two hosts; both call the identical `Infrastructure` classes.

**Multi-tenancy is structural.** Every tenant-scoped entity implements `ITenantScoped`
(`Domain`), and `AiBusinessPlatformDbContext` (`Infrastructure/Data`) reflects over the model at
startup to apply a `BusinessId` query filter to every one of them automatically — there's no way
for a hand-written query to forget the tenant filter.

## Building, running, testing

```bash
dotnet build                                            # whole solution
dotnet run --project src/AiBusinessPlatform.Api          # http://localhost:5151
dotnet run --project src/AiBusinessPlatform.Mcp          # http://localhost:5262
dotnet test                                              # tests/AiBusinessPlatform.Application.Tests
```

Both `Api` and `Mcp` need `ConnectionStrings:Default` and `Jwt:SigningKey` set via
`dotnet user-secrets` (see the root `README.md`'s "Getting started" — they're not in
`appsettings.json` on purpose). The two projects must share the same `Jwt:SigningKey` since a
token issued by `Api`'s `/api/auth/login` is validated directly by `Mcp` (no shared session store,
just a shared secret).

**Migrations** live in `Infrastructure/Data/Migrations` but are applied via the `Api` project as
the "startup project" (it's the one with a real `appsettings.json`/DI container EF can resolve
`AiBusinessPlatformDbContext` through):

```bash
dotnet ef migrations add SomeChange --project src/AiBusinessPlatform.Infrastructure --startup-project src/AiBusinessPlatform.Api
dotnet ef database update --project src/AiBusinessPlatform.Infrastructure --startup-project src/AiBusinessPlatform.Api
```

## Debugging tips that apply across the whole backend

- **Postgres/RabbitMQ connection errors** almost always mean Docker Desktop isn't running (not
  just "the containers are down") — see `infra/README.md`.
- **`MSB3026`/file-lock build errors** mean a previous `dotnet run` for `Api` or `Mcp` is still
  holding the output DLLs — stop that process before rebuilding.
- **A REST call 401s unexpectedly** — check the JWT actually carries the claim the target policy
  needs (`business_id` for `BusinessOnly`, `customer_account_id` for `CustomerOnly`); the two token
  types are not interchangeable, and a customer token will never satisfy a `BusinessOnly` route.
- **An MCP tool call silently does nothing / throws `UnauthorizedAccessException`** — MCP tools
  aren't reachable through ASP.NET Core's `RequireAuthorization` pipeline, so every mutating tool
  calls `IPermissionChecker.EnsurePermission(...)` itself as its first line; check the caller's
  role actually has that `Permission` in `Application/Auth/RolePermissions.cs`.
- **A role/staff change doesn't seem to apply** — JWTs are claims-based with zero DB round-trip
  per request; changes apply at next login/token expiry, not instantly.
