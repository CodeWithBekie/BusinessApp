# AiBusinessPlatform.Application

The pure contracts layer: interfaces, DTOs (as C# `record`s), enums-of-strings, and a handful of
dependency-free static helpers (VAT math, Paynow hashing, WhatsApp webhook parsing). This project
references only `AiBusinessPlatform.Domain` — **nothing here touches EF Core, HTTP clients, or any
concrete integration.** Every interface defined here is implemented exactly once, in
`AiBusinessPlatform.Infrastructure`, and consumed identically by both host projects (`Api`'s REST
endpoints and `Mcp`'s tool wrappers) — the recurring phrase in code comments for this is "one
function, multiple entry points."

## Subfolders

- **`Abstractions/`** — cross-cutting service contracts: tenant/user/customer context resolvers,
  the ledger-posting contract, the payment-gateway contract, the queue-publish contract, WhatsApp
  send contracts.
- **`Auth/`** — the RBAC model: `Permission` enum, the `RolePermissions` matrix, `IPermissionChecker`.
- **`Payments/`** — real Paynow wire-format mechanics (hashing, form encoding), pure and directly
  unit-testable — distinct from `Tools/IPaymentTools.cs`, which is the abstract "create a payment
  request" business contract.
- **`Tools/`** — the big one: one `I*Tools` interface per business capability (catalog, orders,
  payments, approvals, accounting, marketplace, staff, ...). See its own README.
- **`WhatsApp/`** — pure, DB-free Meta webhook payload parsing and signature verification.

## If you're adding a new business capability

1. Define a new `I*Tools` interface in `Tools/` (or extend an existing one if it's a natural fit).
2. Implement it once in `AiBusinessPlatform.Infrastructure/Tools/` under the matching class name.
3. Register it in both `Api/Program.cs` and `Mcp/Program.cs` (`AddScoped<IX, X>()`).
4. Expose it via a REST endpoint (`Api/Endpoints/`) and/or an MCP tool wrapper (`Mcp/Tools/`) —
   whichever entry points make sense; not every capability needs both (e.g. `IMarketplaceTools`
   and `IStaffTools` are REST-only, never AI-facing).

If the action is sensitive (moves money, sends a customer message, or is otherwise something an AI
shouldn't do unsupervised), don't execute it directly from the tool — raise a `PendingApproval` via
`IApprovalTools` instead, following the pattern in `Tools/ApprovalActionDetails.cs`.
