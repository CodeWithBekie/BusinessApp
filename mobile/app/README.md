# app/

File-based routing (expo-router). This folder's `_layout.tsx` and `index.tsx` implement an
architecture worth understanding carefully before adding any new screen — it's caused a real bug
before.

## The session-kind / two-Stack architecture

`_layout.tsx`'s `RootLayoutNav` renders one of three things based on `session` (from
`useAuth()`, `src/auth/AuthContext.tsx`):

1. **No session** → `<AuthScreen />` (the business/customer login picker).
2. **`session.kind === 'business'`** → a `<Stack key="business">` declaring: `index`, `(tabs)`
   (the whole business dashboard, see `(tabs)/README.md`), `modal`, `order/[id]`,
   `catalog-item/[id]`, `pos`, `supplier/[id]`, `purchase-order-new`, `purchase-order/[id]`.
2. **`session.kind === 'customer'`** → a `<Stack key="customer">` declaring: `index`, `(customer)`
   (the marketplace tab bar, see `(customer)/README.md`), `business/[id]`, `checkout`,
   `customer-order/[id]`.

**The `key="business"`/`key="customer"` props are load-bearing, not decoration.** Both branches
render the *same* `Stack` component type at the *same* position in the tree — without differing
keys, React would reconcile them in place instead of fully unmounting/remounting the navigator
when a user logs out of one session kind and into the other.

Each Stack only declares screens relevant to that persona — `order/[id]` (business order detail)
only exists in the business Stack; `customer-order/[id]` only exists in the customer Stack. Adding
a new top-level screen means adding it to the correct Stack's list here, and the screen file must
live directly under `app/`, **not** nested inside `(tabs)/` or `(customer)/` (see below for why).

## Why `index.tsx` exists and just redirects

`(tabs)` and `(customer)` are expo-router *route groups* — the parentheses make the folder name
invisible in the URL — so both groups' own `index.tsx` files implicitly claim the exact same bare
`/` path. Without a single, unambiguous owner of `/`, expo-router's resolver picks one of the two
group indexes arbitrarily and keeps showing it **regardless of which Stack `_layout.tsx` actually
mounted for the current session** — this was a real, shipped bug, confirmed by testing that
deep-linking to an unambiguous path like `/settings` worked fine while bare `/` didn't.

`app/index.tsx` is the fix: a dedicated, non-grouped screen that is the sole owner of `/`. It reads
`session.kind` and immediately issues `<Redirect href="/(tabs)" />` or
`<Redirect href="/(customer)" />`. This is why `index` appears explicitly in *both* Stacks above —
it's the entry point before redirecting into the right one.

**The mental model:** there is no single navigator — there are two, entirely separate, top-level
Stacks selected by `session.kind`, and `index.tsx` exists purely to solve the `/` route-group
ambiguity between them.

## Route groups are Tabs, not Stacks — don't nest a detail screen inside one

`(tabs)/` and `(customer)/` are both `Tabs` navigators (see their own `_layout.tsx`), not `Stack`s.
A `Tabs` navigator can only show its declared flat tab screens — it can't host a nested
push/detail screen. That's why every detail screen (`business/[id]`, `customer-order/[id]`,
`order/[id]`, `catalog-item/[id]`, `supplier/[id]`, `purchase-order/[id]`) is a **top-level
sibling** directly under `app/`, declared in the relevant Stack above, instead of living inside
`(tabs)/` or `(customer)/`. Putting a new detail screen inside one of those folders would make it
show up as an unwanted extra tab rather than a pushed screen — a mistake worth remembering before
you reflexively drop a new screen next to `index.tsx` in either tab folder.

## Every other top-level screen

- **`checkout.tsx`** — customer checkout: receives a serialized cart + `businessId` via route
  params, computes VAT client-side, places the order, shows a payment-reference confirmation, then
  routes to `/(customer)/orders`.
- **`pos.tsx`** — business point-of-sale ("New sale"): Cash Sale or Quotation, customer
  search-or-create, multi-currency-aware cart (locks to one currency once an item is added),
  cash-tendered/change-due calculator, receipt download.
- **`business/[id].tsx`** — customer-facing storefront: browse one business's catalog, build a
  cart, proceed to `/checkout`.
- **`catalog-item/[id].tsx`** — business catalog add/edit, including photo upload
  (`expo-image-picker` → `apiClient.uploadCatalogItemImage`). Item type is locked after creation.
  Deactivate/reactivate instead of delete.
- **`customer-order/[id].tsx`** — a marketplace customer's own order: view detail, cancel
  (immediate if unpaid, request-with-reason if already paid), pay via EcoCash, or upload payment
  proof — which of these show up is driven entirely by booleans (`canCancelDirectly`,
  `canRequestCancellation`, `isPaynowConnected`) computed server-side on `MarketplaceOrderDetail`,
  not re-derived from status here.
- **`order/[id].tsx`** — the business side's order detail: record/edit payment, mark fulfilled,
  send invoice, download receipt, or jump to the Assistant with this order attached as context.
  Distinct API surface and distinct screen from `customer-order/[id].tsx` — don't confuse the two.
- **`purchase-order-new.tsx`** / **`purchase-order/[id].tsx`** — create a new supplier PO (pick
  supplier, add existing or brand-new catalog items with per-line unit cost) and the PO detail
  screen (receive goods, record a supplier payment, download the PO document).
- **`supplier/[id].tsx`** — simple supplier add/edit form, same deactivate/reactivate convention
  as catalog items.
- **`modal.tsx`** — leftover Expo template boilerplate, not part of any real flow; still wired
  into the business Stack as a demo `modal` screen.
