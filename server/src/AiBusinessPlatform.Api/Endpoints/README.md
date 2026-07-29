# Endpoints/

Every REST route in the system, one file per concern. All non-webhook, non-auth routes sit under
`/api`.

| File | Route group | Auth policy |
|---|---|---|
| `AuthEndpoints.cs` | `/api/auth` — signup, login, accept-invite | none (pre-tenant by definition) |
| `CustomerAuthEndpoints.cs` | `/api/customer/auth` — signup, login | none — mirrors `AuthEndpoints` but issues a `customer_account_id` claim instead of `business_id` |
| `DashboardEndpoints.cs` | `/api` — business settings, catalog, orders, customers, approvals, sales summary, suppliers, purchase orders, WhatsApp/Paynow connect, health | `"BusinessOnly"` on the group + per-route `Permission:*` |
| `StaffEndpoints.cs` | `/api/staff` | `"BusinessOnly", "Permission:ManageStaff"` on the whole group |
| `AccountingEndpoints.cs` | `/api/accounting` + `/api/expenses` | `"BusinessOnly", "Permission:ViewAccounting"` on both groups |
| `MarketplaceEndpoints.cs` | `/api/marketplace` | **no blanket policy** — browsing is anonymous; the checkout/order/payment routes are individually `"CustomerOnly"` |
| `WebhooksEndpoints.cs` | `/webhooks` | real webhooks verify a signature/hash manually instead of JWT; dev simulate routes require `"BusinessOnly"` (or nothing, where tenant is resolved from the payload) |
| `AssistantEndpoints.cs` | `/api/assistant` | `"BusinessOnly"` |

**Auth policies** are defined once in `Infrastructure/Auth/JwtAuthenticationExtensions.cs`
(shared by this project and `Mcp`, so tokens are interchangeable between the two hosts):
`CustomerOnly` (requires a `customer_account_id` claim), `BusinessOnly` (requires `business_id`),
and one `Permission:{X}` policy per `Permission` enum value (`ManageCatalog`, `ManageOrders`,
`ManageSuppliers`, `ViewAccounting`, `DecideApprovals`, `ManageBusinessSettings`, `ManageStaff`).
Combining `"BusinessOnly", "Permission:X"` on a route requires both to pass (AND).

## Conventions worth knowing

- **Catalog item images** (`GET /api/catalog/{id}/image`) and marketplace catalog browsing are
  deliberately anonymous — an `<Image>` tag can't carry a bearer token, so trust is by unguessable
  GUID instead. **Payment-proof images** (`GET /api/payments/{id}/proof-image`) go the opposite
  way on purpose: returned as base64 JSON rather than a raw file response, specifically so they
  *can* be gated behind `Permission:DecideApprovals` — a payment proof is a private financial
  document, not a public product photo.
- **Sensitive-action dispatch**: `DashboardEndpoints`'s `POST /api/approvals/{id}/decision` is the
  one place an AI-initiated sensitive action (cancel a paid order, send a drafted message, confirm
  a payment proof) actually executes, dispatched by `ActionType` string. Adding a new sensitive
  action type means adding a branch here *and* a matching entry in
  `Application/Tools/ApprovalActionDetails.cs`.
- Pre-tenant lookups (signup, login, webhooks) use `.IgnoreQueryFilters()` deliberately — there's
  no ambient tenant yet to filter by, and the code says so in a comment at each call site.
- `POST /api/orders` (direct order creation) returns `501` on purpose — real orders are only ever
  created through the AI orchestrator's `reserve_stock` tool or the marketplace/POS flows.

## Testing/debugging

```bash
# get a token
curl -X POST http://localhost:5151/api/auth/signup -H "Content-Type: application/json" \
  -d '{"businessName":"Test Co","industryType":"retail","ownerName":"Test Owner","email":"owner@test.local","password":"TestPass123!"}'
# use it
curl http://localhost:5151/api/catalog -H "Authorization: Bearer <token>"
```

- **Simulate a WhatsApp message** without a real Meta webhook: `POST /webhooks/whatsapp/simulate`
  with `{"customerNumber":"+263...","text":"..."}` and a business JWT — publishes to the
  `whatsapp.inbound` queue, consumed by `Orchestrator/WhatsAppOrchestratorConsumer.cs`.
- **Simulate a payment confirmation**: `POST /webhooks/payments/manual` with
  `{"orderId":"...","providerReference":"x","status":"confirmed"}` — no auth needed, tenant is
  resolved from the order itself.
- The **real** Meta webhook (`POST /webhooks/whatsapp`) needs a valid `X-Hub-Signature-256` header
  computed from `WhatsApp:AppSecret` — not curl-able without computing that HMAC yourself. Same
  for the real Paynow webhook (form-urlencoded + a hash from that business's own
  `PaynowConnection.IntegrationKey`).
