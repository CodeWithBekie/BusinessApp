import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { cardBackground, radius, shadows, spacing } from '@/constants/theme';

// A small metric tile for the real, client-computed stat rows at the top of a list screen (e.g.
// "Active suppliers: 8") — same shadow/radius language as Card, sized to sit several-wide in a
// horizontal row. accentColor tints the value only, for a quick color cue (e.g. semanticColors.
// warning for a "Pending" count) without needing a separate colored-card variant.
export function StatCard({ label, value, accentColor }: { label: string; value: string | number; accentColor?: string }) {
  return (
    <View style={styles.card} lightColor={cardBackground.light} darkColor={cardBackground.dark}>
      <Text style={[styles.value, accentColor ? { color: accentColor } : null]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 96,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'flex-start',
    ...shadows.card,
  },
  value: { fontSize: 20, fontWeight: '800' },
  label: { fontSize: 11, opacity: 0.6, marginTop: 2, fontWeight: '600' },
});
