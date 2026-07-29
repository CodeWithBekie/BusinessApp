# Abstractions/

Cross-cutting service contracts, mostly ambient-context resolvers implemented once in
`Infrastructure` and consumed everywhere. Every provider here is a `Guid`/`Guid?`, resolved from a
JWT claim — each interface's own doc comment explains whether `null`/missing is a legitimate state
or a bug.

| Interface | Purpose |
|---|---|
| `ICurrentTenantProvider` | `Guid CurrentBusinessId` — resolved once at ingress, never re-derived from message content. Throws if read with no tenant resolved (treated as "a route forgot auth", not a real case). |
| `ICurrentTenantSetter` | Lets a non-HTTP caller (a queue consumer) push a `businessId` into the *same scoped instance* `ICurrentTenantProvider` reads from. |
| `ICurrentUserProvider` | Nullable `CurrentUserId` — the business staff member who did this, for audit/approval attribution. |
| `ICurrentUserRoleProvider` | Nullable `BusinessUserRole`, read straight off the JWT role claim — no DB lookup, so a role change or deactivation doesn't apply until next login/token expiry. |
| `ICurrentCustomerProvider` | Nullable `CurrentCustomerAccountId` — the marketplace-customer mirror of `ICurrentUserProvider`, from a distinct `customer_account_id` claim never present on a business token. |
| `ILedgerPostingService` | The double-entry bookkeeping engine (`PostSaleAsync`, `PostExpenseAsync`, `PostPurchaseReceiptAsync`, `PostSupplierPaymentAsync`) — internal only, never REST/MCP-exposed. Adds rows to the caller's own already-open `DbContext`; the caller still has to `SaveChangesAsync`. |
| `IPaynowClient` | Real Paynow Express Checkout wire contract (`InitiateMobileTransactionAsync`, `PollTransactionAsync`). |
| `IQueuePublisher` | `PublishAsync(queueName, payload)` — RabbitMQ backs it locally; swappable behind this interface. |
| `IWhatsAppMessageService` | The single choke point for sending a WhatsApp message to a customer (connection lookup + send + persist + retry scheduling) — nothing bypasses it. |
| `IWhatsAppSender` | The raw one-shot Graph API text-send call, wrapped by `IWhatsAppMessageService`. |

If you need "who is calling right now" in a new piece of code, it's one of these five provider
interfaces — resolve it via DI, don't thread a `businessId`/`userId` parameter through manually
unless you're implementing one of these interfaces itself.
