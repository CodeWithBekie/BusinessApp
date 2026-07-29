# Tools/

Real implementations of every interface in `Application/Tools/` — one class per interface, same
naming convention throughout (`ICatalogTools` → `CatalogTools.cs`, `IOrderTools` → `OrderTools.cs`,
etc.): `AccountingTools.cs`, `ApprovalTools.cs`, `CatalogTools.cs`, `CustomerTools.cs`,
`DocumentGenerationTools.cs`, `ExpenseTools.cs`, `HealthTool.cs`, `InsightsTools.cs`,
`MarketplaceTools.cs`, `MessagingTools.cs`, `OrderTools.cs`, `PaymentTools.cs`,
`PurchaseOrderTools.cs`, `RagTools.cs`, `StaffTools.cs`, `SupplierTools.cs`. Plus
`DocumentChunker.cs` (a shared helper, not tied 1:1 to an interface).

This is where the actual business logic lives — see `Application/Tools/README.md` for what each
capability covers; this folder is just "where it's really implemented."

## One exception to the one-class-per-interface rule

**`NotImplementedTools.cs`** currently holds `DeliveryTools : IDeliveryTools`, whose methods both
throw `NotImplementedException` (delivery driver assignment/tracking is a documented future
feature, not built yet). If a tool call unexpectedly 500s with a `NotImplementedException`, check
this file first before assuming something else broke — it's the one deliberate stub left in an
otherwise fully-implemented tool surface.

## Cross-tenant scoping pattern (worth knowing before writing a new customer-facing method)

Most methods here simply trust the ambient `ICurrentTenantProvider.CurrentBusinessId` (set once
per request/message and never re-derived). The one place that's genuinely cross-tenant —
`MarketplaceTools`'s customer-facing methods — resolves the caller's own linked `Customer` row(s)
from their `CustomerAccountId` (never a client-supplied id) via `.IgnoreQueryFilters()`, then
scopes everything else to just those ids. If you're adding a new method a marketplace customer
calls directly, follow `MarketplaceTools.ResolveOwnedOrderAsync`'s pattern rather than trusting a
client-supplied `businessId`/`orderId` pair directly.
