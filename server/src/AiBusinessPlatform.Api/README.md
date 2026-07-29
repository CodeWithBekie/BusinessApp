# AiBusinessPlatform.Api

The REST backend the mobile app talks to: business dashboard endpoints, the customer marketplace,
WhatsApp/Paynow webhook ingress, the streaming AI Assistant endpoint, and three in-process
background workers (WhatsApp orchestrator, WhatsApp retry sweeper, payment webhook consumer).

## Running it

```bash
dotnet run --project src/AiBusinessPlatform.Api
```

`http://localhost:5151` (http profile) or `https://localhost:7075;http://localhost:5151` (https).
Needs Postgres + RabbitMQ running (`infra/`) and `ConnectionStrings:Default`/`Jwt:SigningKey` set
via `dotnet user-secrets` (root `README.md`). LM Studio running locally is only needed for
AI-touching endpoints (`/api/assistant/chat`, RAG search, the WhatsApp agent) — everything else
works without it.

In Development, Swagger UI is at `/swagger` with a Bearer auth scheme pre-wired: get a token from
`POST /api/auth/login` or `/api/auth/signup`, click "Authorize", paste it in, then exercise any
endpoint interactively. `/health` reports Postgres reachability.

## What's in this project

- **`Program.cs`** — the single source of truth for what's registered: every `Application.Tools`
  interface gets one `AddScoped<IX, X>()` line, the JWT/permission auth policies, the LM Studio
  chat/embedding clients, the three background services, and all the route-group registrations
  (`app.Map*Endpoints()`). If you're not sure whether something is wired up, this file has the
  answer.
- **`Endpoints/`** — every REST route, grouped by concern. See its own README.
- **`Assistant/`** — support types (`ElicitationRegistry`, `McpServerOptions`) for the streaming AI
  chat endpoint; the endpoint itself lives in `Endpoints/AssistantEndpoints.cs`. See its own README.
- **`Contracts/`** — request/response DTOs consumed by `Endpoints/*.cs`, one file per logical
  contract group.
- **`Orchestrator/`** — the WhatsApp AI ordering agent, running as a background queue consumer.
  See its own README.
- **`Payments/`** — the payment-confirmation background queue consumer. See its own README.
- **`Auth/`, `Tenancy/`** — empty/vestigial folders left over from an earlier layout. All real
  auth and tenant-resolution code lives in `Infrastructure/Auth/HttpBusinessIdTenantProvider.cs`
  and `Infrastructure/Auth/JwtAuthenticationExtensions.cs` instead.
- **`appsettings.json`** — non-secret config: `App:PublicBaseUrl`, `RabbitMq`, `LmStudio`,
  `WhatsApp:GraphApiVersion` (real Meta secrets are user-secrets only), `Paynow`, `Jwt` (minus
  `SigningKey`), `McpServer:BaseUrl` (where the Assistant endpoint finds the `Mcp` project).

## Non-obvious patterns worth knowing before you change anything here

- **One tenant provider, four interfaces.** `HttpBusinessIdTenantProvider` is registered once
  (`AddScoped<HttpBusinessIdTenantProvider>()`) and then forwarded to `ICurrentTenantProvider`,
  `ICurrentTenantSetter`, `ICurrentUserProvider`, and `ICurrentUserRoleProvider` via
  `sp => sp.GetRequiredService<HttpBusinessIdTenantProvider>()`. This matters because a background
  consumer calls `ICurrentTenantSetter.SetBusinessId()` to push tenant context, and other scoped
  services then read it back via `ICurrentTenantProvider` from *the same instance*. Registering
  each interface separately (`AddScoped<ICurrentTenantProvider, ...>()` etc.) would silently break
  this — they'd resolve to different instances and the setter's value would never be seen.
- **Business logic never lives in an endpoint file.** Every endpoint is a thin wrapper calling an
  `Application.Tools` interface — the same implementation `Mcp`'s tools and the WhatsApp
  orchestrator call. If you're tempted to add a `if` branch of real logic directly in an
  `Endpoints/*.cs` file, it almost certainly belongs in the `Infrastructure/Tools` implementation
  instead.
- **`QuestPDF.Settings.License = LicenseType.Community`** must be set once at startup before any
  PDF (receipts, purchase-order documents) is generated — it's in `Program.cs`, don't remove it.
- Dev-only permissive CORS (`DevCors`) only applies in `Development`, for the Expo web preview.

## Debugging

- Background services (`WhatsAppOrchestratorConsumer`, `PaymentWebhookConsumer`,
  `WhatsAppRetryHostedService`) start automatically with the app. If RabbitMQ isn't reachable they
  log a warning and retry with backoff — they never crash the host, so a silent "nothing is
  happening" is more likely a missing/unhealthy RabbitMQ than a crashed worker. Check the console
  log for `"Connected to RabbitMQ"` / `"Listening on RabbitMQ queue '...'"` at startup.
  `Http Get /health` confirms Postgres, but there's no equivalent check for RabbitMQ or LM Studio —
  their failures only show up in the console log or in a specific endpoint's error response.
