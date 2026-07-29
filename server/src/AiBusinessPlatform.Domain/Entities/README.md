# Entities/

26 entity classes. All but two (`Business`, `CustomerAccount`) implement `ITenantScoped` and are
automatically filtered by `BusinessId` on every query.

**Tenant roots / identity — not `ITenantScoped`, because they *are* the tenant/identity, not data
scoped to one:**
- `Business.cs` — the tenant root: `Currency`, `VatRate`, `Timezone`, optional `ParentBusinessId`
  (multi-branch), `IsPubliclyListed` (marketplace opt-in), fiscal fields (`Tin`, `VatNumber`,
  `FiscalDeviceId`) for compliant invoices.
- `CustomerAccount.cs` — marketplace login identity, deliberately not tenant-scoped since one
  account can shop across many businesses; links to per-business `Customer` rows via
  `Customer.CustomerAccountId`.

**Commerce core**
- `BusinessUser.cs` — staff account (`Role`, `IsActive`, invite token/expiry for a pending invite).
- `CatalogItem.cs` — sellable item (`ItemType`, `Price`, `Cost` = most recent purchase-order unit
  cost, `StockQuantity`, optional image bytes).
- `Customer.cs` — per-business customer record (WhatsApp number, optional link to `CustomerAccount`).
- `Order.cs` — sale header (`Status`, `TotalAmount` VAT-inclusive, `VatAmount`, `InvoiceNumber`).
- `OrderItem.cs` — order line (quantity, unit price, subtotal, VAT).
- `Payment.cs` — payment against an order (`Provider`, `ProviderReference`, `Status`, Paynow
  `ExternalReference`/`PollUrl`, POS `AmountTendered`, customer-uploaded proof image bytes).
- `Delivery.cs` — delivery status/driver for an order (schema exists ahead of logic — see
  `IDeliveryTools` in the Application layer).
- `TimeSlot.cs` — booking slots for `TimeBased` catalog items.

**Supplier / inventory restocking**
- `Supplier.cs` — supplier contact record.
- `PurchaseOrder.cs` — PO header (`Status`, `TotalAmount`, `AmountPaid`; `AmountOwed` is always
  computed, never stored).
- `PurchaseOrderItem.cs` — PO line; either references an existing `CatalogItemId` or carries
  `NewItemName`/`Type`/`Unit` for an item not yet in the catalog (created at receive time).

**Accounting (double-entry ledger)**
- `Account.cs` — chart-of-accounts row (`Code`, `Name`, `Type`), lazily seeded per business from
  `Application/Tools/LedgerAccountCodes.StandardAccounts`.
- `JournalEntry.cs` — header of one auto-posted transaction; never manually entered.
  `SourceType`/`SourceId` trace back to what triggered it.
- `JournalLine.cs` — one debit-or-credit leg; exactly one of `Debit`/`Credit` is non-zero
  (enforced in `Infrastructure/Ledger/LedgerPostingService.cs`, not a DB constraint).
- `Expense.cs` — non-inventory spend record.

**Messaging / AI / RAG**
- `Conversation.cs` — one open/closed WhatsApp thread per customer.
- `Message.cs` — inbound/outbound message with delivery/retry tracking (`Status`, `AttemptCount`,
  `NextAttemptAt`, `LastError`, `DeliveredAt`, `ReadAt` — retry fields only meaningful for Outbound).
- `Document.cs` — RAG source document metadata.
- `DocumentChunk.cs` — chunked content + a `Pgvector.Vector` embedding + `SectionLabel` for citations.

**External connections**
- `WhatsAppConnection.cs` — per-business WABA + phone number + system user token.
- `PaynowConnection.cs` — per-business `IntegrationId`/`IntegrationKey`/`NotificationEmail`.
- `McpIntegrationAccount.cs` — a scoped credential issued per business for external MCP clients.

**Approvals / audit**
- `PendingApproval.cs` — the human-in-the-loop gate (`ActionType`, `DetailsJson`, `Status`,
  `DecidedBy`) — see `Application/Tools/ApprovalActionDetails.cs` for the fixed registry of
  `ActionType` values.
- `AuditLog.cs` — before/after JSON snapshot of every state-changing action.

## A convention you'll notice repeatedly

Several entities (`Delivery`, `OrderItem`, `Payment`, `PurchaseOrderItem`, `DocumentChunk`,
`Message`) carry their own `BusinessId` even though they're reachable via a parent join (e.g.
`OrderItem` → `Order.BusinessId`). This is deliberate, not an oversight — it's what lets the global
tenant query filter apply directly to these tables without requiring a join, and every such field
has a comment saying so ("denormalized for tenant-scoped query filter"). If you add a new child
entity under an existing tenant-scoped parent, follow the same pattern.
