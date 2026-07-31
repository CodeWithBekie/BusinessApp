import { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { cardBackground, radius, shadows, spacing, typography } from '@/constants/theme';

// Standardizes the "titled card section" pattern already used ad-hoc on detail screens (e.g.
// customer-order/[id].tsx's local Section) — an optional accentColor renders a colored left border,
// matching that screen's status-accented sections.
export function Section({ title, children, accentColor }: { title: string; children: ReactNode; accentColor?: string }) {
  return (
    <View
      style={[styles.section, accentColor ? { borderLeftColor: accentColor, borderLeftWidth: 3 } : null]}
      lightColor={cardBackground.light}
      darkColor={cardBackground.dark}
    >
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md + 2,
    ...shadows.card,
  },
  title: { ...typography.sectionTitle, marginBottom: spacing.md - 2 },
});
