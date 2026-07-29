# Tools/

Twelve `*McpTools.cs` files, each a thin `[McpServerToolType]` class wrapping one
`Application.Tools` interface.

| File | Wraps | Notable exposed tools |
|---|---|---|
| `HealthMcpTools.cs` | `IHealthTool` | `Ping` |
| `CatalogMcpTools.cs` | `ICatalogTools` | `check_catalog_availability`, `list_catalog_items`, `create_catalog_item`/`update_catalog_item` (perm: ManageCatalog) |
| `RagMcpTools.cs` | `IRagTools` | `search_business_documents` (read-only — ingestion stays dashboard-only, never AI-facing) |
| `InsightsMcpTools.cs` | `IInsightsTools` | `get_sales_summary` (perm: ViewAccounting) |
| `OrderMcpTools.cs` | `IOrderTools` | `list_orders`, `get_order`, `mark_order_fulfilled` (perm: ManageOrders — the "who did this" is always resolved from the caller's JWT, never the model), `create_invoice`, `update_order_payment_provider` |
| `ApprovalMcpTools.cs` | `IApprovalTools` | `list_pending_approvals`, `decide_approval` — `decidedBy` always resolved server-side, never from the model |
| `CustomerMcpTools.cs` | `ICustomerTools` | `list_customers` (read-only, no permission gate) |
| `SupplierMcpTools.cs` | `ISupplierTools` | `list_suppliers`, `create_supplier` (perm-gated) |
| `PurchaseOrderMcpTools.cs` | `IPurchaseOrderTools` | `list_purchase_orders`, `get_purchase_order`, create/receive (perm-gated) |
| `CustomerMessagingMcpTools.cs` | `ICustomerTools` + `IMessagingTools` | Drafts a customer message via MCP **sampling** (asks the *connected client's own model*, not a server-side key), then persists it as a `PendingApproval` — never sends directly |
| `AccountingMcpTools.cs` | `IAccountingTools` | `get_cash_up`, `get_profit_and_loss`, `get_general_ledger`, `get_trial_balance`, `get_cash_flow` (all perm: ViewAccounting) |
| `ExpenseMcpTools.cs` | `IExpenseTools` | `list_expenses`, create-expense (perm: ViewAccounting) |

## Conventions

- Mutating tools call `permissionChecker.EnsurePermission(...)` as the **first statement** in the
  method body, before doing anything else.
- Optional parameters always get an explicit `= null`/`= default` — MCP's schema generation marks
  a parameter without one as required, and models routinely omit optional args, causing avoidable
  hard failures.
- Sensitive actions (cancelling a paid order, sending a message) never execute directly from a
  tool call here — they raise a `PendingApproval` via `IApprovalTools`, same as the REST side.

If a tool you'd expect to see here is missing — check `Application/Tools/README.md`'s "AI-facing?"
column first; `IMarketplaceTools`, `IStaffTools`, and `IDocumentGenerationTools` are deliberately
REST-only and have no wrapper in this folder at all.
