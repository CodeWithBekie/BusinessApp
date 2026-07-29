# offline/

The offline-first data architecture used by nearly every read screen in the app.

- **`useCachedFetch.ts`** — the core hook: `useCachedFetch<T>(cacheKey, fetchFn)` returns
  `{ data, error, refreshing, isFromCache, reload }`. `reload(isRefresh?)` calls `fetchFn()`; on
  success it caches the result (fire-and-forget) and clears `isFromCache`; on failure it falls back
  to whatever's cached under `cacheKey` — if something's there, it's shown with `isFromCache = true`
  and **no error is surfaced**; only a total cache miss sets `error`. Changing `cacheKey` (e.g.
  switching a filter) resets `data`/`error`/`isFromCache` immediately, so the previous key's stale
  data never flashes under the new key.
- **`networkStatus.ts`** — `useIsOnline()`, wrapping `@react-native-community/netinfo`. Fails open
  (treats an unknown/unclear network state as online) rather than blocking actions pessimistically.
- **`cache.ts`** — thin `AsyncStorage` wrapper (`getCached`/`setCached`, JSON under a `cache:` key
  prefix) and `clearAllCache()`, called by `../auth/AuthContext.tsx`'s `logout()` so cached data
  never survives into a different user's session.
- **`OfflineBanner.tsx`** — a single banner ("You're offline — showing saved data"), mounted once
  in both `(tabs)/_layout.tsx` and `(customer)/_layout.tsx`, above the tab bar so it's visible
  everywhere in that persona's app.

## The convention this enables

Every *read* screen: `useCachedFetch` + an `isFromCache` "Showing saved data" note. Every *write*
action independently calls `useIsOnline()` and disables itself + shows "You're offline — connect
to …" when offline. There's no offline mutation queue or background sync — writes are simply
blocked client-side while offline, not deferred and retried later. If you're building a new screen
that reads data, use `useCachedFetch` rather than a bare `useEffect`+`fetch`, to stay consistent
with this behavior (and get the cache-on-logout wipe for free).
