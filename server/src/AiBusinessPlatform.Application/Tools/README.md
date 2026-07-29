# Tools/

One `I*Tools` interface per business capability — the core of the whole system. Each is
implemented exactly once in `Infrastructure/Tools/` (matching class name) and consumed identically
by REST endpoints (`Api/Endpoints/`) and, where noted, MCP tool wrappers (`Mcp/Tools/`) — "one
function, multiple entry points."

| Interface | Capability | AI-facing? |
|---|---|---|
| `IHealthTool` | Proof-of-wiring ping | yes |
| `ICatalogTools` | Catalog CRUD + stock reservation lifecycle (reserve/release/finalize — `OrderItem.Id` doubles as the reservation id, no separate reservation table) | yes |
| `IOrderTools` | Order lifecycle: list/get, quotations, invoicing, POS sales, manual payment recording, payment-provider correction, cancellation (paid vs. unpaid), fulfillment | yes (some methods; cancellation execution and payment confirmation are deliberately not AI-exposed) |
| `IPaymentTools` | Abstract payment-aggregator contract (`CreatePaymentRequestAsync`/`GetPaymentStatusAsync`) — real implementation targets Paynow | no (internal) |
| `IDeliveryTools` | Delivery driver assignment/status — **contract only, not implemented yet** (Phase 1 feature; calls throw `NotImplementedException` today) | n/a |
| `IApprovalTools` | Human-in-the-loop gating: raise/check/decide/list `PendingApproval`s. No "execute" method exists here by design — execution always lives on the specific tool the approval is about | yes (list/decide) |
| `IRagTools` | RAG retrieval (business-scoped similarity search over uploaded documents) + document ingestion (dashboard-only, not AI-facing) | yes (retrieval only) |
| `IInsightsTools` | Sales summary reporting (totals, trend, top items) for a time range | yes |
| `ICustomerTools` | Customer search/lookup, to avoid duplicate customer records on POS sales | yes |
| `ISupplierTools` | Supplier CRUD | yes |
| `IPurchaseOrderTools` | Restocking from suppliers: create/list/get/receive purchase orders, record supplier payments | yes |
| `IMarketplaceTools` | Customer-facing (mobile app) marketplace: browse, place orders, list/get/cancel own orders, request cancellation of a paid order, pay via EcoCash, submit payment proof | **no** — REST-only, deliberately not AI-facing |
| `IDocumentGenerationTools` | PDF generation (order receipts, purchase-order documents) | **no** — REST-only, MCP has no binary-response concept |
| `IMessagingTools` | Persist a drafted WhatsApp reply as a pending approval; only sends once approved | yes (drafting via sampling) |
| `IStaffTools` | Owner-only staff roster management (invite/resend-invite/update) | **no** — REST-only |
| `IExpenseTools` | Non-inventory spend tracking (rent, utilities, wages, ...) — the counterpart to purchase orders | yes |
| `IAccountingTools` | Reporting suite: cash-up, profit & loss, general ledger, trial balance, multi-period cash flow | yes |

## Two registries worth knowing about specifically

- **`ApprovalActionDetails.cs`** — the fixed registry for every sensitive action type a
  `PendingApproval` can represent: `ApprovalActionTypes` constants (`cancel_paid_order`,
  `send_customer_message`, `payment_proof_submitted`) each paired with a `*Details` record
  describing that action's `DetailsJson` shape. This is how the producer (the tool raising the
  approval) and the consumer (`Api/Endpoints/DashboardEndpoints.cs`'s decision dispatch) agree on a
  typed contract instead of a stringly-typed one. **Adding a new sensitive action type means adding
  a new const + details record here, and a new dispatch branch at the decision endpoint** — the
  two are not automatically kept in sync by the type system.
- **`LedgerAccountCodes.cs`** — the fixed chart of accounts: string codes (`cash`, `bank`,
  `mobile_money`, `other_receipts`, `inventory`, `accounts_payable`, `vat_payable`,
  `sales_revenue`, `cost_of_goods_sold`, plus one `expense_*` code per `ExpenseCategory`), each
  mapped to an `AccountType`. There is no dynamic account creation anywhere in the system — if a
  new kind of transaction needs a new account, it starts here.

Also here: `ReportDateRangeResolver.cs` (shared `range=today|7d|30d|all` vs. explicit `from`/`to`
parsing, used by every reporting tool) and `VatCalculator.cs` (shared VAT math).

## Adding a new tool method

Add it to the interface here first, then implement it in the matching `Infrastructure/Tools/`
class. If it's AI-facing, add a wrapper in the corresponding `Mcp/Tools/*McpTools.cs` file too —
mutating tools must call `permissionChecker.EnsurePermission(...)` as their first line (MCP calls
bypass ASP.NET Core's authorization pipeline entirely, so this is a real, separate enforcement
point, not a formality). If the action is sensitive, don't execute it directly — raise a
`PendingApproval` instead (see `ApprovalActionDetails.cs` above).
