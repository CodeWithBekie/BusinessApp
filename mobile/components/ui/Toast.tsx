import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Themed';
import { Icon } from '@/components/ui/Icon';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { radius, semanticColors, shadows, spacing } from '@/constants/theme';

export type ToastVariant = 'success' | 'error' | 'info';

// Single animated bottom banner, rendered by ToastProvider. success gets a scale-in checkmark —
// this doubles as the app's "success animation," rather than a separate overlay system.
export function Toast({ message, variant }: { message: string; variant: ToastVariant }) {
  const colorScheme = useColorScheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, friction: 7, useNativeDriver: true }),
    ]).start();
    if (variant === 'success') {
      Animated.spring(checkScale, { toValue: 1, delay: 100, friction: 5, useNativeDriver: true }).start();
    }
  }, [opacity, translateY, checkScale, variant]);

  const color = variant === 'success' ? semanticColors.success : variant === 'error' ? semanticColors.danger : Colors[colorScheme].tint;

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity, transform: [{ translateY }] }]}>
      <View style={[styles.toast, { backgroundColor: color }]}>
        {variant === 'success' && (
          <Animated.View style={{ transform: [{ scale: checkScale }] }}>
            <Icon name="checkmark.circle" size={18} color="#fff" />
          </Animated.View>
        )}
        {variant === 'error' && <Icon name="exclamationmark.triangle" size={16} color="#fff" />}
        <Text style={styles.message} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.xxxl, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 420,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md + 2,
    ...shadows.floating,
  },
  message: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
});
