import { Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { Text } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { radius, semanticColors, spacing } from '@/constants/theme';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'destructive' | 'success';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Replaces every screen's own hardcoded `backgroundColor: '#007aff'` button with a shared
// primary/secondary/destructive/success set driven by the real theme tint + semantic colors.
export function Button({ label, variant = 'primary', loading, disabled, style, ...props }: ButtonProps) {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const isDisabled = disabled || loading;

  const variantStyle =
    variant === 'primary'
      ? { backgroundColor: tint }
      : variant === 'destructive'
        ? { backgroundColor: semanticColors.danger }
        : variant === 'success'
          ? { backgroundColor: semanticColors.success }
          : { backgroundColor: 'transparent', borderWidth: 1, borderColor: tint };

  const labelColor = variant === 'secondary' ? tint : '#fff';

  return (
    <Pressable style={[styles.button, variantStyle, isDisabled && styles.disabled, style]} disabled={isDisabled} {...props}>
      <Text style={[styles.label, { color: labelColor }]}>{loading ? '…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingVertical: 14, paddingHorizontal: spacing.lg, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.6 },
  label: { fontWeight: '700', fontSize: 15 },
});
