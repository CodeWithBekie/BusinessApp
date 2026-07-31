import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { Text } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/theme';

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Replaces every screen's own `filterChip`/`filterChipActive` pair with one shared filter/selector
// pill.
export function Chip({ label, active, onPress, disabled, style }: ChipProps) {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.chip, active && { backgroundColor: tint, borderColor: tint }, disabled && styles.disabled, style]}
    >
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm - 2, borderRadius: radius.lg, borderWidth: 1, borderColor: '#ccc' },
  disabled: { opacity: 0.5 },
  label: { fontSize: 13, fontWeight: '500', opacity: 0.7, textAlign: 'center' },
  labelActive: { color: '#fff', opacity: 1 },
});
