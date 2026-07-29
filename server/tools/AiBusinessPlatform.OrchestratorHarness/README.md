# AiBusinessPlatform.OrchestratorHarness

A standalone console app for interactively exercising the WhatsApp order-taking AI loop
(`check_catalog_availability` / `reserve_stock` / `release_stock_reservation` / `create_invoice`)
against a real LM Studio model and a real Postgres database — **without** needing RabbitMQ, a real
WhatsApp connection, or the full `Api` host running. It wraps the exact same tool-calling logic
`Api/Orchestrator/WhatsAppOrchestratorConsumer.cs` uses in production, as a REPL.

## When to reach for this instead of the real thing

Iterating on the WhatsApp system prompt or tool set without waiting on RabbitMQ/webhook plumbing;
reproducing a specific customer conversation quickly to debug model behavior in isolation; sanity-
checking that a newly-loaded LM Studio model actually supports function-calling before wiring it
into the real consumer.

## Running it

Needs Postgres up (`infra/`) and a connection string set for *this* project specifically:

```bash
cd server
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5433;Database=aibp_dev;Username=aibp;Password=devpassword" --project tools/AiBusinessPlatform.OrchestratorHarness
dotnet run --project tools/AiBusinessPlatform.OrchestratorHarness
```

LM Studio must be running locally too (`appsettings.json` here only configures
`LmStudio:BaseUrl`/`Model`). Then just type messages at the prompt, e.g. `do you have cement?` —
`exit`/`quit` (or Ctrl-Z/Ctrl-D) to stop. Tool calls and results print inline (`[tool call]`/
`[tool result]`) alongside the assistant's replies, so you can see exactly what the model decided
to do at each turn.

## Files

- **`Program.cs`** — builds a generic `Host`, registers `AiBusinessPlatformDbContext` and the same
  `ICatalogTools`/`IOrderTools`/`IPaymentTools` used in production (the Paynow/WhatsApp send
  dependencies are registered only to satisfy constructors — never actually called, since the
  harness's dev business has no real `PaynowConnection`/`WhatsAppConnection`), builds an
  `IChatClient` from LM Studio, and runs the read-eval-print loop. Handles common LM Studio
  connection errors (unreachable, 401, non-function-calling model) with a readable message instead
  of a raw exception.
- **`Tenancy/FixedDevTenantProvider.cs`** — an `ICurrentTenantProvider` stand-in that always
  returns the seeded dev business id. Its own comment says it plainly: this is a local dev tool,
  not a multi-tenant entry point — don't reuse this pattern anywhere that needs real tenant
  isolation.
- **`appsettings.json`** — just `LmStudio:BaseUrl`/`Model`.
