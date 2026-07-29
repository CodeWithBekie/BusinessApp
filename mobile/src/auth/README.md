# auth/

The whole login/session/permission system for both personas.

- **`AuthContext.tsx`** — `AuthProvider`/`useAuth()`. Holds `session: Session | null` in React
  state, seeded from the root layout's session-restore effect. Exposes `login`/`signup`/
  `acceptInvite` (business) and `customerLogin`/`customerSignup`, plus a shared `logout`. Every
  successful auth call funnels through `applySession()` (sets the api-client token, updates state,
  persists via `saveSession`). `logout()` clears everything **and wipes the offline cache**
  (`clearAllCache()` from `../offline/cache.ts`) so cached data never leaks between different
  logged-in users. Also registers the "any 401 anywhere → logout" handler on the api client.
- **`sessionStorage.ts`** — the `Session` discriminated union: `BusinessSession { kind: 'business',
  token, businessId, businessUserId, role }` vs. `CustomerSession { kind: 'customer', token,
  customerAccountId, email, name }` — this `kind` field is what `app/_layout.tsx` branches the
  entire navigation architecture on (see `../../app/README.md`). Persists via `expo-secure-store`
  on native, `localStorage` on web (secure-store has no real web implementation).
- **`permissions.ts`** — the `Permission` union and `ROLE_PERMISSIONS` map, hand-mirrored from the
  server's `RolePermissions.cs` (no shared codegen — same manual-sync convention as `../api/client.ts`'s
  DTOs; keep the two in sync by hand when either changes). `useHasPermission(permission)` only ever
  returns `true` for a business session — there's no permission concept on the customer/marketplace
  side at all.
- **`AuthScreen.tsx`** — the top-level gate rendered whenever `session` is null: a business-owner
  vs. customer picker, then either `<CustomerAuthScreen>` or an inline `BusinessAuthForm` with 3
  modes — `login`, `signup` (business name/industry/owner name/email/password), `accept-invite`
  (invite code + new password, for staff invited via the Settings tab).
- **`CustomerAuthScreen.tsx`** — the customer-side sibling form, `login`/`signup` only.
- **`authFormStyles.ts`** — `styles`/`useInputStyle()` shared by the two auth screen files, pulled
  out into its own module specifically to avoid a Metro bundler require-cycle warning that existed
  when `CustomerAuthScreen.tsx` imported these directly from `AuthScreen.tsx`.

## No invite emails

There's no email-sending anywhere in this system yet. An Owner inviting staff (Settings tab) gets
a one-time invite code/link shown on-screen to share manually — the invitee enters that code on the
`accept-invite` form above to set their own password. Keep this in mind if you're testing
multi-role permission gating: you'll be copy-pasting a code between two sessions, not clicking an
email link.
