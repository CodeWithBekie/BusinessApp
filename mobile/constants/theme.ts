// Design tokens formalizing the visual language already established by the redesigned customer
// screens (customer-order/[id].tsx, business/[id].tsx, (customer)/assistant.tsx) — extracted here so
// every screen references one source instead of independently re-choosing spacing/radius/shadow
// values. Colors.ts (light/dark text/background/tint) is untouched and still the source for theming.

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16 } as const;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
} as const;

// The same three status colors every redesigned screen already re-derives locally under a
// different const name (PAYMENT_STATUS_COLORS, DELIVERY_STATUS_COLORS, etc.) — one shared source.
export const semanticColors = {
  success: '#2e7d32',
  warning: '#f2994a',
  danger: '#c0392b',
  neutral: '#8e8e93',
} as const;

export const typography = {
  title: { fontSize: 20, fontWeight: '700' as const },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    opacity: 0.5,
  },
  body: { fontSize: 15 },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  meta: { fontSize: 12 },
} as const;

// Matches the card background convention already used across every redesigned screen.
export const cardBackground = { light: '#fff', dark: 'rgba(255,255,255,0.05)' } as const;
