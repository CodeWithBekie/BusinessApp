# constants/

**`Colors.ts`** — the one centralized color palette: `{ light: {...}, dark: {...} }` with
`text`/`background`/`tint`/`tabIconDefault`/`tabIconSelected` keys, consumed by
`../components/Themed.tsx`.

**Known inconsistency worth knowing about:** most screens still hardcode their own hex colors
inline in `StyleSheet.create` (`#007aff` for primary actions, `#c0392b` for destructive/error,
`#2e7d32` for success/positive, etc.) rather than referencing this file — so there's real drift
between the "official" theme palette here and the colors actually used for buttons/badges
throughout the app. Not a bug, just something to be aware of if you're trying to make a
palette-wide color change; grepping for the hardcoded hex values will find more than this file
alone would suggest.
