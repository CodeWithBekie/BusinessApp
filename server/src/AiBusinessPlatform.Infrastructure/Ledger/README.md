# Ledger/

The double-entry bookkeeping engine — `LedgerPostingService.cs`, the one `ILedgerPostingService`
implementation.

## How it works

- **`EnsureChartOfAccountsAsync`** runs at the top of every `Post*Async` call. It's idempotent —
  checks both the DB and the current `ChangeTracker` (so multiple posts within the same request
  never duplicate an account row) — and lazily inserts whichever of
  `Application/Tools/LedgerAccountCodes.StandardAccounts` this business doesn't have yet. There is
  no manual "set up your chart of accounts" step; it happens automatically on first use.
- **`PostSaleAsync`** splits VAT-exclusive revenue, VAT payable, and the cash-equivalent debit into
  one journal entry; if `costOfGoodsSold > 0`, it posts a **separate, independently-balanced second
  journal entry** for COGS (Dr Cost of Goods Sold / Cr Inventory) rather than extra lines on the
  same entry — this keeps each entry self-checking (its own debits equal its own credits) and
  avoids a zero-amount COGS line noising up the ledger for an item that's never actually been
  purchased (no cost basis yet).
- **`PostExpenseAsync`** — Dr the expense account mapped from `ExpenseCategory` / Cr cash-equivalent.
- **`PostPurchaseReceiptAsync`** — accrual-basis, Dr Inventory / Cr Accounts Payable, at
  goods-received time (not at order-placement time). No-ops if the received cost is zero.
- **`PostSupplierPaymentAsync`** — Dr Accounts Payable / Cr cash-equivalent.

## What actually triggers a posting

Nothing calls these methods directly from a controller/endpoint. Callers in
`Infrastructure/Tools/` (`OrderTools.RecordPosSaleAsync`/`RecordManualPaymentAsync`,
`ExpenseTools.CreateExpenseAsync`, `PurchaseOrderTools.ReceivePurchaseOrderAsync`/
`RecordSupplierPaymentAsync`) call the relevant `Post*Async` method against their **own
already-open `DbContext`**, then call `SaveChangesAsync` once — so a ledger posting is always
atomic with the business event that caused it. There is no separate "reconciliation" or batch
posting job.

`JournalLine.Debit`/`Credit` mutual exclusivity (exactly one is non-zero per line) is enforced
only here, in code — not as a database constraint. If you're adding a new kind of posting, follow
the existing methods' shape rather than writing raw `JournalLine`s by hand elsewhere.

## Debugging

To verify a specific event posted correctly, query `GET /api/accounting/general-ledger` filtered
by account, or `GET /api/accounting/trial-balance` to confirm total debits still equal total
credits system-wide (they always should — if they don't, something bypassed this service).
`JournalEntry.SourceType`/`SourceId` trace every entry back to the order/expense/purchase-order
that caused it.
