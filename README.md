# AI Business Automation Platform

Phase 0 scaffolding for an AI-driven order-to-cash platform over WhatsApp. See
[`docs/product-spec-v1.3.md`](docs/product-spec-v1.3.md) for the full product spec — this repo
currently implements only the **structural skeleton** that spec's Section 22 timeline calls for
by Week 2 ("architecture, data model, and .NET project scaffolding finalized"), *before* any real
WhatsApp, payment, or AI-model integration.

## Layout

```
server/   ASP.NET Core (.NET 9) backend — Domain / Application / Infrastructure / Api / Mcp
mobile/   Expo (React Native, TypeScript) owner dashboard app
infra/    Docker Compose — PostgreSQL (pgvector) + RabbitMQ, for local dev
docs/     Product spec
```

`server/src` follows a "same function, two entry points" split (spec Section 10.7): `Application`
defines tool-function contracts (`CheckAvailability`, `RequestApproval`, etc.), `Infrastructure`
implements them, and both `Api` (in-process orchestrator) and `Mcp` (external AI clients like
Claude/ChatGPT) call the exact same implementations. Only one tool — `IHealthTool.Ping` — has a
real Phase 0 implementation; every other tool is an interface + DTO stub that throws
`NotImplementedException` pointing at the spec section that defines its real behavior.

## What's real vs. stubbed in Phase 0

- **Real**: the 17-table EF Core data model with tenant-isolation query filters, the pgvector
  extension wiring, `/health`, `/api/catalog|orders|approvals|sales/summary` (empty/seeded reads),
  the RabbitMQ-backed webhook ingress (logs + enqueues, no processing), and the `IHealthTool`
  proof-of-wiring exposed both via the Api and the Mcp server.
- **Stubbed** (throws `NotImplementedException`, references the spec section to implement): all
  other Section 10.3 tools (catalog reservation, payments, delivery, approvals, RAG retrieval),
  webhook signature verification, and the `/api/assistant/chat` streaming endpoint (returns one
  placeholder chunk instead of a real `IChatClient` response).

## Prerequisites

- .NET SDK 9.x
- Docker Desktop
- Node.js 20+ / npm

## Getting started

```
cd infra
cp .env.example .env      # first time only
docker compose up -d
```

```
cd server
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5433;Database=aibp_dev;Username=aibp;Password=devpassword" --project src/AiBusinessPlatform.Api
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5433;Database=aibp_dev;Username=aibp;Password=devpassword" --project src/AiBusinessPlatform.Mcp
dotnet ef database update --project src/AiBusinessPlatform.Infrastructure --startup-project src/AiBusinessPlatform.Api
dotnet run --project src/AiBusinessPlatform.Api    # http://localhost:5151
dotnet run --project src/AiBusinessPlatform.Mcp    # http://localhost:5262 (separate terminal)
```

```
cd mobile
npx expo start --web    # or --android / --ios
```

Connection strings are never committed — they live in `dotnet user-secrets` locally. Production
secrets (WhatsApp tokens, payment/AI provider keys) will use Azure Key Vault (spec Section 15)
once those integrations exist; that's out of scope for this scaffold.

**Note:** the mobile app's `app.json` `extra.apiBaseUrl` points at `http://localhost:5151`, which
only resolves from a web preview or iOS simulator. Android emulator needs `10.0.2.2` instead of
`localhost`; a physical device needs your machine's LAN IP. Not solved here — override
`apiBaseUrl` per target when you get there.

## Local ports

Postgres and RabbitMQ are remapped on the host side because this machine already runs other
projects on the standard ports:

| Service | Standard port | This project's host port |
|---|---|---|
| PostgreSQL | 5432 | 5433 |
| RabbitMQ (AMQP) | 5672 | 5673 |
| RabbitMQ (management UI) | 15672 | 15673 |

## Known Phase 0 shortcuts (see spec Section 23 for the underlying open decisions)

- Tenant resolution is a dev-only `X-Business-Id` header, defaulting to a seeded dev business
  (`00000000-0000-0000-0000-000000000001`) — real auth/JWT claims come with spec Section 14.
- `document_chunks.embedding` is `vector(1536)` (OpenAI `text-embedding-3-small` size) as a
  placeholder until an embedding provider is chosen.
- CORS is wide-open in Development only, to let the Expo web preview call the Api across origins.
