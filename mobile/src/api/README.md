# api/

**`client.ts`** — the single central API client. Every HTTP call to the backend goes through this
one file (roughly 45 methods on the exported `apiClient` object, plus ~40 hand-written
`interface`/`type` declarations mirroring the C# API's DTOs — there's no shared codegen between
the .NET and TypeScript sides, so these are kept in sync by hand).

## The core pattern: `request<T>(path, init)`

Wraps `fetch` with `Content-Type: application/json` + `Authorization: Bearer <token>` (merged with
any caller-supplied headers), checks for a 401 (fires the registered unauthorized handler — see
below), throws a formatted `Error` (including status/statusText/body) on any non-OK response,
returns `undefined` for a 204, otherwise parses JSON. Almost every method on `apiClient` is a
one-liner calling this.

## Auth token threading

A module-level `authToken` variable, set via `setAuthToken(token)` (called by
`../auth/AuthContext.tsx` on login/logout/session-restore) and read via `getAuthToken()` (used by
`../documents/downloadAndShare.ts` for its own separate authenticated fetch).
`setUnauthorizedHandler(handler)` lets `AuthContext` register a callback that fires on *any* 401
anywhere in the app — wired to `logout()`, so an expired/invalid token drops the user back to the
login screen automatically, from wherever they happen to be.

## Two exceptions to the JSON `request<T>` pattern

- **File uploads** (`uploadCatalogItemImage`, `submitPaymentProof`) bypass `request()` and call
  `fetch` directly with a `FormData` body and *no* `Content-Type` header (so the browser/RN sets
  the correct multipart boundary itself). Both branch on `Platform.OS === 'web'` (build a real
  `Blob` by re-fetching the local `uri`) vs. native (append a `{uri, name, type}` object directly —
  React Native's `FormData` accepts that shape for local `file://`/`content://` URIs where no real
  `Blob` exists). Follow this exact pattern for any new upload endpoint.
- **`streamAssistantChat()`** is Server-Sent Events over a `fetch` body reader
  (`response.body.getReader()`), not a single JSON response — it manually buffers and splits on
  `\n\n`, parsing `data: {...}` lines with a `type` of `token`/`done`/`error`/`elicitation_request`.
  A code comment flags that React Native's own `fetch` has historically had inconsistent streaming
  support on Android in particular — not solved here.

## If you're adding a new endpoint call

Add a method to `apiClient` following the existing convention for its shape (JSON body → use
`request<T>`; file upload → copy `submitPaymentProof`'s pattern), and add/extend the matching
TypeScript interface near the bottom of the file. Keep the field names and shape in sync with the
actual C# response by hand — there's no compiler check across the two languages, only manual care.
