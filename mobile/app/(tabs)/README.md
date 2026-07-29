# (tabs)/

The business dashboard — a `Tabs` navigator (not a `Stack`; see `../README.md` for why that
matters for adding new screens) for an authenticated business user.

`_layout.tsx` declares 7 tabs, each hideable per-user via `useHasPermission` setting
`href: null` (un-lists the tab without unmounting its route): **Catalog** (`index`), **Orders**
(`orders`), **Suppliers** (`suppliers`), **Sales** (`sales`), **Approvals** (`approvals`),
**Assistant** (`assistant`), **Settings** (`settings`). Renders `<OfflineBanner />` above the tab
bar, visible on every tab.

| Screen | What it does |
|---|---|
| `index.tsx` (Catalog) | Item list with filter chips (All/Active/Inactive), thumbnails, type/price/stock. "+ Add item" and tap-to-edit both gated by `ManageCatalog`. |
| `orders.tsx` | Business order list with status filter chips, navigates to `/order/[id]`. |
| `suppliers.tsx` | Two sections (Suppliers / Purchase Orders) toggled by a `SectionTabs` component, each independently fetched. |
| `sales.tsx` | The biggest screen: 6 internal sections (Sales, P&L, Cash Up, Cash Flow, Ledger, Expenses) via the same `SectionTabs` pattern. Sales/P&L/Cash Flow share a range-tabs + custom date-range picker; Ledger has its own Trial Balance/General Ledger toggle inside it. "+ New sale" (gated `ManageOrders`) opens `/pos`. |
| `approvals.tsx` | `PendingApproval` list; `describeDetails()` special-cases the known action types (`cancel_paid_order`, `send_customer_message`, `payment_proof_submitted`) with a parse-and-fallback-to-raw-JSON pattern, so a new backend action type never crashes the app even before this screen is updated to describe it nicely. Approve/Reject gated `DecideApprovals`. Includes an on-demand payment-proof image viewer. |
| `assistant.tsx` | The AI chat screen — streams via SSE (`streamAssistantChat`), supports resource attachments (via `attachUri`/`attachLabel` route params, used by the "Ask Assistant about this" buttons on Order/PO detail screens) and mid-conversation elicitation (structured form input requested by a tool, rendered as a modal). |
| `settings.tsx` | Permission-gated cards: staff management (`ManageStaff`, owner-only), business visibility/details, WhatsApp/Paynow connect forms, RAG document upload (all `ManageBusinessSettings`). Logout is always visible. |

## Conventions across every tab

Every list screen: `useCachedFetch<T>(cacheKey, fetchFn)` + `useFocusEffect(() => load())` +
`FlatList`/card with a color-coded status badge, a horizontal filter-chip row, an `isFromCache`
"Showing saved data" note, and an inline `error` banner. Every mutating action calls
`useIsOnline()` and disables itself + shows "You're offline — connect to …" when offline — writes
are blocked client-side, not queued for later.

Permission gating (`useHasPermission(permission)` from `src/auth/permissions.ts`) hides whole tabs
(`href: null`) or individual buttons/sections within a screen. If a tab or button seems to be
"missing" for a test account, check that account's role against
`server/src/AiBusinessPlatform.Application/Auth/RolePermissions.cs` (and that
`src/auth/permissions.ts`'s hand-mirrored copy hasn't drifted from it).
