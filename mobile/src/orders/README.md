# orders/

**`orderStatus.ts`** — re-exports `formatMoney`/`formatRelativeDate` from `../common/format.ts`,
plus `ORDER_STATUS_COLORS` (a color per `OrderStatus` value) and `ORDER_STATUS_FILTERS` (the same
values with a leading `'All'`), used by every order-list/detail screen's status badge and filter
chips.
