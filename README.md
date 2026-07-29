# AI Business Platform

A multi-tenant commerce platform for small/medium businesses: customers order over WhatsApp (an
AI agent takes the order, reserves stock, invoices, and confirms payment) or through a mobile
marketplace app; the business runs its whole back office — catalog, orders, suppliers/purchasing,
staff (with role-based permissions), a real double-entry accounting ledger, and an AI "Business
Brain" chat assistant — from the same mobile app. Everything the AI can do is also reachable as a
real MCP (Model Context Protocol) server, so any MCP-compatible client (Claude, ChatGPT, etc.) can
operate the business too.

See [`docs/product-spec-v1.3.md`](docs/product-spec-v1.3.md) for the original product spec and
phased roadmap. The system has grown well past the "Phase 0 scaffold" the spec describes — RBAC,
the full accounting suite (double-entry ledger, P&L, cash flow), the AI Business Brain, and
customer-facing order/payment management are all real and working, not stubs.

## Layout

```
server/   ASP.NET Core (.NET 9) backend — Domain / Application / Infrastructure / Api / Mcp
mobile/   Expo (React Native, TypeScript) app — business dashboard AND customer marketplace
infra/    Docker Compose — PostgreSQL (pgvector) + RabbitMQ, for local dev
docs/     Product spec
```

Each folder listed above (and every meaningful subfolder inside `server/` and `mobile/`) has its
own `README.md` explaining what lives there, key files, conventions, and how to test/debug that
specific part. Start with `server/README.md` and `mobile/README.md` for the two big halves of the
system, then drill into subfolders as needed.

## Architecture, in one paragraph

`server/src` follows a strict layered split, repeated identically for every business capability
(catalog, orders, payments, approvals, accounting, etc.): **`Application`** defines an interface
per capability (`ICatalogTools`, `IOrderTools`, ...) with no implementation and no dependency on
anything except `Domain`; **`Infrastructure`** implements every one of those interfaces exactly
once (EF Core, HTTP clients, RabbitMQ); and **two separate host projects — `Api` and `Mcp` — both
call the exact same implementations** ("one function, multiple entry points"). `Api` is the REST
backend the mobile app talks to, plus the WhatsApp/payment webhook ingress and background workers.
`Mcp` exposes the identical business logic as MCP tools/resources for any AI client, including the
`Api` project's own streaming Assistant endpoint, which connects to `Mcp` as a real MCP client.

Multi-tenancy is enforced structurally, not by convention: every tenant-scoped entity implements
`ITenantScoped`, and `AiBusinessPlatformDbContext` applies a `BusinessId` query filter to all of
them automatically via reflection — no query anywhere can accidentally leak another business's
data by a forgotten `.Where()`. Anything sensitive an AI could do on its own (cancel a paid order,
send a drafted WhatsApp message, confirm a customer's uploaded payment proof) never executes
directly from a tool call — it raises a `PendingApproval` that only a human decision can execute.

## Prerequisites

- .NET SDK 9.x
- Docker Desktop (must actually be running before `docker compose up` — see Troubleshooting)
- Node.js 20+ / npm
- [LM Studio](https://lmstudio.ai/) running locally with a function-calling-capable chat model
  loaded, plus an embedding model — needed for the WhatsApp AI agent, the Assistant chat, and RAG
  document search. Everything else works without it.

## Getting started

```bash
cd infra
cp .env.example .env      # first time only
docker compose up -d
```

```bash
cd server
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5433;Database=aibp_dev;Username=aibp;Password=devpassword" --project src/AiBusinessPlatform.Api
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5433;Database=aibp_dev;Username=aibp;Password=devpassword" --project src/AiBusinessPlatform.Mcp
dotnet user-secrets set "Jwt:SigningKey" "some-long-random-dev-only-string" --project src/AiBusinessPlatform.Api
dotnet user-secrets set "Jwt:SigningKey" "some-long-random-dev-only-string" --project src/AiBusinessPlatform.Mcp   # must match the Api's key — Mcp validates tokens the Api issues
dotnet ef database update --project src/AiBusinessPlatform.Infrastructure --startup-project src/AiBusinessPlatform.Api
dotnet run --project src/AiBusinessPlatform.Api    # http://localhost:5151
dotnet run --project src/AiBusinessPlatform.Mcp    # http://localhost:5262 (separate terminal)
```

```bash
cd mobile
npx expo start --web --port 8090    # or --android / --ios
```

There's no seed/demo account — sign up a fresh business (`POST /api/auth/signup` or the mobile
app's "I'm a business owner → Sign up" form) to create a tenant and an Owner user, or "I'm shopping
→ Sign up" for a marketplace customer account. Owner-invited staff accept their invite via a code
shown on-screen (no email sending exists yet — see `mobile/src/auth/README.md`).

Connection strings and signing keys are never committed — they live in `dotnet user-secrets`
locally. Production secrets (WhatsApp tokens, Paynow keys, the JWT signing key) will use a real
secrets manager once deployed; that's out of scope for local dev.

**Mobile API base URL:** `mobile/app.json`'s `extra.apiBaseUrl` points at `http://localhost:5151`,
which only resolves from a web preview or iOS simulator. Android emulator needs `10.0.2.2` instead
of `localhost`; a physical device needs your machine's LAN IP — edit `apiBaseUrl` per target.

## Testing

```bash
cd server
dotnet test    # runs the xUnit suite (webhook signature/payload parsing, Paynow hash/form codec — pure logic, no DB/services needed)

cd mobile
npx tsc --noEmit    # type-check the whole app
```

There's no integration/E2E test suite — feature verification in this repo has consistently been
done by running the real API + mobile app together and exercising flows via curl and the browser
preview. `server/README.md` has a Swagger-based REST walkthrough; `server/src/AiBusinessPlatform.Api/Orchestrator/README.md`
covers simulating WhatsApp conversations without needing a real Meta webhook.

## Local ports

Postgres and RabbitMQ are remapped on the host side in case other projects on this machine already
use the standard ports.

| Service | Standard port | This project's host port |
|---|---|---|
| PostgreSQL | 5432 | 5433 |
| RabbitMQ (AMQP) | 5672 | 5673 |
| RabbitMQ (management UI) | 15672 | 15673 |
| Api | — | 5151 (http), 7075 (https) |
| Mcp | — | 5262 (http), 7188 (https) |
| Mobile web preview | — | whatever you pass to `--port` (8090 by convention in this repo) |

## Troubleshooting

- **`Failed to connect to 127.0.0.1:5433` / any Postgres connection error** — Docker Desktop itself
  isn't running (not just the container). Start Docker Desktop, wait for `docker ps` to work, then
  `docker inspect --format='{{.State.Health.Status}}' aibp-postgres` until it says `healthy` before
  retrying. This has been the single most common local-dev failure in this project's history.
- **`MSB3026`/`MSB3027` file-lock build errors** — a previous `dotnet run` for the Api or Mcp
  project is still holding the output DLLs. Find and stop it (`Get-NetTCPConnection -LocalPort 5151
  -State Listen | Stop-Process` on Windows, or kill the PID reported in the error) before rebuilding.
- **A business dashboard tab or button is missing** — almost certainly a `Permission` gate
  (`useHasPermission` in the mobile app). Check `RolePermissions.cs` (server) /
  `mobile/src/auth/permissions.ts` (mobile, hand-mirrored — no shared codegen) to see what the
  logged-in user's role actually grants.
- **A change to a role/permission doesn't take effect** — JWTs are claims-based with no DB
  round-trip; a role change or staff deactivation only applies at the user's next login or token
  expiry (`Jwt:ExpiryMinutes`, default 1440), not immediately.
- **The Assistant/WhatsApp agent gives an error immediately** — LM Studio isn't running, or the
  loaded model doesn't support function/tool calling. Nothing else in the system depends on it.
- **Web preview shows the wrong screen after login** — see `mobile/app/README.md`'s explanation of
  the business/customer session-kind routing architecture; this exact class of bug has happened
  before (a route-group ambiguity, since fixed) and is worth understanding before assuming it's a
  new bug.

## What's built

Order-to-cash over WhatsApp (AI-driven quoting/invoicing/payment/stock), a customer-facing
marketplace app (browse, order, cancel, pay via EcoCash or upload payment proof for manual
review), full catalog/supplier/purchase-order management, staff accounts with role-based
permissions, a real auto-posting double-entry accounting ledger (trial balance, general ledger,
cash flow, P&L, cash-up), fiscal/VAT-compliant invoicing, an AI "Business Brain" dashboard chat
with RAG document grounding and financial-report citations, and the same tool surface exposed as a
standalone MCP server for external AI clients. See `docs/product-spec-v1.3.md` for what's
explicitly still out of scope (delivery driver automation, natural-language automation builder,
payroll/HR/CRM modules).
