# components/ (root level)

The theming/platform-shim layer — mostly carried over from the original Expo template, used
pervasively across every real screen. Don't confuse this with `../src/components/`, which holds
app-specific components (currently just one unused placeholder).

- **`Themed.tsx`** — exports `Text`/`View` wrapper components (shadowing React Native's own) that
  accept `lightColor`/`darkColor` props and resolve the right one via `useThemeColor()` →
  `../constants/Colors.ts`. This is the pattern used everywhere instead of raw RN components +
  hardcoded colors — e.g. `<View lightColor="#fff" darkColor="rgba(255,255,255,0.05)">` — so
  screens automatically support dark mode without extra plumbing. Use this pattern for any new
  screen.
- **`useColorScheme.ts`** (native) / **`useColorScheme.web.ts`** — native wraps RN's own hook
  (coercing `'unspecified'` → `'light'`); web is hardcoded to always return `'light'` (RN styling
  doesn't cleanly support SSR color-scheme detection here).
- **`useClientOnlyValue.ts`** (native, trivial passthrough) / **`useClientOnlyValue.web.ts`**
  (starts at a server-safe value, flips to the client value after mount) — used by both tab-bar
  layouts for `headerShown: useClientOnlyValue(false, true)` to avoid a React Navigation web
  hydration mismatch.
- **`ExternalLink.tsx`** — wraps expo-router's `Link` for external URLs; on native, opens an
  in-app browser (`expo-web-browser`) instead of the OS default.
- **`StyledText.tsx`** — a `MonoText` component applying the `SpaceMono` font.
- **`EditScreenInfo.tsx`** — leftover Expo template boilerplate, only referenced by the vestigial
  `app/modal.tsx` demo screen.
