# components/

Currently holds one file, **`DataListScreen.tsx`** — a generic fetch/loading/error/empty/
`FlatList`-of-strings component, explicitly commented in its own header as a Phase 0 placeholder
("replace with real per-screen UI once the API's endpoints return more than empty/seed data").

**It isn't used anywhere** in the current `app/` screens — every real screen ended up with its own
bespoke list UI instead (see `../../app/(tabs)/README.md`'s convention section). Treat this file as
vestigial rather than a pattern to follow for a new screen; it's a candidate for removal if you're
doing cleanup, but hasn't caused any harm sitting unused either.

Don't confuse this folder with the root-level `../../components/` (theming system: `Themed.tsx`,
`useColorScheme`, etc.) — that one *is* used pervasively across the app.
