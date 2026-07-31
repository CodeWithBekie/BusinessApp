import { StyleSheet } from 'react-native';

import { View, ViewProps } from '@/components/Themed';
import { cardBackground, radius, shadows, spacing } from '@/constants/theme';

// Replaces every screen's own bordered `styles.card`/`cardInner` box with the shadowed-card look
// already established by the redesigned customer screens.
export function Card({ style, ...props }: ViewProps) {
  return <View style={[styles.card, style]} lightColor={cardBackground.light} darkColor={cardBackground.dark} {...props} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: spacing.lg,
    ...shadows.card,
  },
});
