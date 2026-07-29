# common/

**`format.ts`** — two pure functions used throughout the app:

- `formatMoney(amount, currency)` → `"USD 12.50"` style string.
- `formatRelativeDate(iso)` → cascading relative time ("just now" / "Xm ago" / "Xh ago" / "Xd ago"
  / falls back to a locale date string beyond a few days).

Re-exported from `../orders/orderStatus.ts` and `../catalog/catalogItemType.ts` for convenience —
import from either depending on what else you need from that module, they're the same functions.
