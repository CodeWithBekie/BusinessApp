# mobile/

Expo (React Native, TypeScript, expo-router) app. One codebase serving two very different
personas — the business dashboard and the customer marketplace — branching at runtime on which
kind of account is logged in. See `app/README.md` for how that branching actually works; it's the
trickiest part of this codebase and has been a real bug source before.

## Running it

```bash
npx expo start --web --port 8090    # or --android / --ios
```

There's no `.env` — the only environment knob is `app.json`'s `expo.extra.apiBaseUrl`
(default `http://localhost:5151`), read via `expo-constants` in `src/api/client.ts`. This only
resolves correctly from a web preview or iOS simulator — Android emulator needs
`http://10.0.2.2:5151` instead of `localhost`; a physical device needs your machine's LAN IP. Edit
`apiBaseUrl` per target when testing on Android or a real device.

The backend (`server/src/AiBusinessPlatform.Api`) must be running for anything beyond the initial
login screen to work.

## Testing

```bash
npx tsc --noEmit    # type-check the whole app — this is the closest thing to a test suite here
```

There's no automated UI test suite. Feature verification has consistently been done by running the
real backend + this app together and exercising flows directly (curl for backend state checks,
the browser preview for UI).

## A real gotcha: Expo SDK version

`AGENTS.md` (included by `CLAUDE.md`) has a one-line but important warning: **Expo has changed
significantly** — read the exact versioned docs at
`https://docs.expo.dev/versions/v57.0.0/` before writing new code that touches an Expo API,
rather than relying on general React Native knowledge. A concrete example already in this
codebase: `expo-file-system`'s main export moved to a new File/Directory class API in this SDK;
`src/documents/downloadAndShare.ts` deliberately imports from `expo-file-system/legacy` to keep
using the old function-based API.

## Layout

```
app/            file-based routes (expo-router) — see app/README.md for the routing architecture
src/            shared logic: api client, auth, offline caching, formatting utils
components/     theming system (light/dark mode, platform shims) — Expo-template-derived
constants/      color palette
assets/         fonts, images (no README — static files only)
```

## No seed/demo account

Sign up a fresh business (`I'm a business owner → Sign up`) or a fresh marketplace customer
(`I'm shopping → Sign up`) against your local backend — there's no pre-seeded login. Owner-invited
staff accept via a one-time code shown on-screen after inviting them (no email sending exists
today — see `src/auth/README.md`).
