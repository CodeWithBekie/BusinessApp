# AiBusinessPlatform.Mcp

A second ASP.NET Core 9 host exposing the platform's business logic as MCP (Model Context
Protocol) tools/resources over HTTP — for external AI clients (Claude, ChatGPT, etc.) and for the
`Api` project's own Assistant endpoint, which connects here as a real MCP client. There is exactly
one tool surface in the whole system, not a parallel copy — every method in this project is a 1-2
line wrapper calling the same `Application.Tools` implementation `Api`'s REST endpoints call.

## Running it

```bash
dotnet run --project src/AiBusinessPlatform.Mcp
```

`http://localhost:5262` (or `https://localhost:7188;http://localhost:5262`). Needs the same
`ConnectionStrings:Default` and `Jwt:SigningKey` (must match `Api`'s key exactly) via
`dotnet user-secrets`. LM Studio is only needed if a connected client triggers sampling or a tool
touches embeddings/RAG.

## Connecting a client

Any MCP client (Claude Desktop, a script, or `Api`'s own `AssistantEndpoints.cs`) points at
`http://localhost:5262` with `Authorization: Bearer <token>` carrying a **business** JWT (from
`Api`'s `POST /api/auth/login`) — `app.MapMcp().RequireAuthorization()` gates the whole MCP
endpoint on that same JWT auth. There's no Swagger UI here (it's an MCP transport, not REST) — the
easiest way to exercise it locally is via `Api`'s `/api/assistant/chat` endpoint.

## What's registered (`Program.cs`)

`HealthMcpTools`, `CatalogMcpTools`, `RagMcpTools`, `InsightsMcpTools`, `OrderMcpTools`,
`ApprovalMcpTools`, `CustomerMcpTools`, `SupplierMcpTools`, `PurchaseOrderMcpTools`,
`CustomerMessagingMcpTools`, `AccountingMcpTools`, `ExpenseMcpTools` (all `.WithTools<T>()`), plus
`.WithResources<BusinessResources>()`. **Deliberately absent** (REST-only, Api-project concerns
with no MCP equivalent): `IMarketplaceTools`, `IStaffTools`, `IDocumentGenerationTools`.

## Subfolders

- **`Tools/`** — every `*McpTools.cs` wrapper class. See its own README.
- **`Resources/`** — `BusinessResources.cs`, read-only MCP resources meant to be attached as
  context (not invoked by the model's own tool-calling loop).
- **`Tenancy/`** — empty/vestigial. Tenant resolution is identical to `Api`: the same
  `HttpBusinessIdTenantProvider` (from `Infrastructure/Auth/`), reading the same JWT claims — there
  is no cookie-based session anywhere in this system, MCP calls carry the same bearer JWT a REST
  call would.

## The one enforcement pattern to know before adding a new tool

Because MCP calls bypass ASP.NET Core's `RequireAuthorization`/policy pipeline entirely, **every
mutating tool method calls `IPermissionChecker.EnsurePermission(Permission.X)` as its first
statement** — this is a second, independent enforcement point mirroring the REST `Permission:X`
policies, not a bypass of them. Also: any optional tool parameter needs an explicit `= null`/
`= default` default — without it, MCP's reflection-based schema marks the parameter "required" and
models routinely omit optional args, causing hard errors.
