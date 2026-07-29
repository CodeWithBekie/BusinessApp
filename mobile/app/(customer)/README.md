# (customer)/

The marketplace shopper experience — a `Tabs` navigator (see `../README.md`) for an authenticated
`CustomerAccount`, much smaller than the business side.

`_layout.tsx` declares 3 tabs: **Browse** (`index`), **My Orders** (`orders`), **Account**
(`account`). Renders `<OfflineBanner />` above the tab bar, same as the business side.

| Screen | What it does |
|---|---|
| `index.tsx` (Browse) | List of `PublicBusinessSummary` (businesses that opted into the marketplace), navigates to `/business/[id]` (the storefront, a top-level sibling route — see below). |
| `orders.tsx` (My Orders) | List of the customer's own marketplace orders, navigates to `/customer-order/[id]`. |
| `account.tsx` | Trivial: session name/email, logout. |

## Important: this is a Tabs navigator, not a Stack

This is the exact folder where a real bug happened before, so it's worth restating here too: you
**cannot** put a detail/push screen inside `(customer)/` — a `Tabs` navigator only shows its
declared flat tab screens. The storefront (`business/[id].tsx`) and this persona's order-detail
screen (`customer-order/[id].tsx`) are both top-level siblings directly under `app/`, declared in
the customer `<Stack>` in `app/_layout.tsx`, precisely so they push/stack correctly on top of this
tab bar instead of trying (and failing) to become a fourth tab.
