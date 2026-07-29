# Data/

The multi-tenancy mechanism and EF Core plumbing.

- **`AiBusinessPlatformDbContext.cs`** — in `OnModelCreating`, reflects over every entity type in
  the model; for each one whose CLR type implements `ITenantScoped` (see `Domain/ITenantScoped.cs`),
  it applies `HasQueryFilter(e => e.BusinessId == _tenantProvider.CurrentBusinessId)` via a generic
  helper method invoked through reflection (`MakeGenericMethod`). **Every** LINQ query against a
  tenant-scoped `DbSet` is filtered automatically as a result — nobody writing a query has to
  remember a `.Where(x => x.BusinessId == ...)` clause, and it's structurally impossible to
  accidentally leak another tenant's rows through a forgotten filter. To deliberately bypass it
  (pre-tenant lookups like login/signup, or genuinely cross-tenant reads like a marketplace
  customer's orders across businesses), call `.IgnoreQueryFilters()` explicitly — every such call
  site in this codebase has a comment explaining why it's safe. Also registers the Postgres
  `vector` extension for `DocumentChunk.Embedding`.
- **`DesignTimeDbContextFactory.cs`** — used only by `dotnet ef migrations add`/`database update`.
  Supplies a fake tenant provider (`Guid.Empty`) and reads the connection string from the
  `AIBP_CONNECTION_STRING` env var, falling back to
  `Host=localhost;Port=5433;Database=aibp_dev;Username=aibp;Password=devpassword` — this is how
  migrations run without needing the whole `Api` host (and its RabbitMQ/LM Studio dependencies) up.
- **`DevSeedData.cs`** — fixed, deterministic GUIDs for a dev business/owner/3 catalog items, used
  by `HasData` migrations.
- **`Configurations/`** — one `IEntityTypeConfiguration<T>` per entity that needs explicit Fluent
  API beyond conventions (17 files, picked up automatically via
  `ApplyConfigurationsFromAssembly`). Indexes/constraints worth knowing when debugging a data
  issue:
  - `BusinessUserConfiguration` — **unique index on `Email`, globally** (not per-business) —
    login has to resolve one account before any tenant is known.
  - `CustomerAccountConfiguration` — unique index on `Email` (marketplace login).
  - `PaymentConfiguration` — **unique index on `ProviderReference`** (this is the webhook
    redelivery idempotency key), plus a composite `(OrderId, Status)` index.
  - `OrderConfiguration` — composite `(BusinessId, Status)` and `(CustomerId, Status)` indexes.
  - `PaynowConnectionConfiguration` — unique index on `BusinessId` (one Paynow connection per
    business).
  - `WhatsAppConnectionConfiguration` — unique index on `PhoneNumberId` (webhook ingress resolves
    `business_id` directly from the receiving phone number).
- **`Migrations/`** — generated EF Core migration files, one pair (`.cs` + `.Designer.cs`) per
  schema change, plus `AiBusinessPlatformDbContextModelSnapshot.cs` (the cumulative current-state
  snapshot). Don't hand-edit these except to fix an EF-generated default value that's actually
  wrong for existing rows (this has happened once in this repo's history — a boolean column
  defaulting to `false` when every pre-existing row needed `true` — always read a freshly generated
  migration before applying it).

## Running migrations

```bash
cd server
dotnet ef migrations add SomeChange --project src/AiBusinessPlatform.Infrastructure --startup-project src/AiBusinessPlatform.Api
dotnet ef database update --project src/AiBusinessPlatform.Infrastructure --startup-project src/AiBusinessPlatform.Api
```

`Api` is used as the "startup project" purely because it has a real `appsettings.json`/DI
container EF can resolve the `DbContext` through — the actual schema change is defined by
`Infrastructure`.
