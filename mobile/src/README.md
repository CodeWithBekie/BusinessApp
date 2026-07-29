# src/

Shared logic used across `app/`'s screens — the API client, auth, offline caching, and small
formatting/constants modules. Nothing in here is a screen itself; screens live in `../app/`.

- **`api/`** — the one central API client every screen calls through.
- **`auth/`** — the whole login/session/permission system.
- **`offline/`** — the offline-first data-fetching architecture (`useCachedFetch` and friends).
- **`approvals/`, `catalog/`, `orders/`** — small per-domain constants (status colors/filters,
  type labels), plus a couple of these re-export `common/format.ts`'s helpers for convenience.
- **`common/`** — `formatMoney`/`formatRelativeDate`, used everywhere.
- **`documents/`** — the PDF receipt/invoice download-and-share flow.
- **`components/`** — a single, currently-unused placeholder component (see its own README) —
  don't confuse this with the root-level `../../components/` (the theming system), which is
  actually used everywhere.
