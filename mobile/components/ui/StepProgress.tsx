import { Fragment } from 'react';
import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Icon } from '@/components/ui/Icon';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

// Compact horizontal step tracker (dot + label per step, connecting line) — generalized from the
// pattern first proven in customer-order/[id].tsx's local OrderProgress, reused wherever a status
// naturally moves through a fixed sequence (e.g. a purchase order's Draft -> Ordered -> Received).
export function StepProgress({ steps, currentIndex, color }: { steps: readonly string[]; currentIndex: number; color?: string }) {
  const colorScheme = useColorScheme();
  const tint = color ?? Colors[colorScheme].tint;
  const trackColor = colorScheme === 'dark' ? 'rgba(255,255,255,0.12)' : '#e5e5ea';

  return (
    <View style={styles.row} lightColor="transparent" darkColor="transparent">
      {steps.map((step, i) => {
        const reached = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <Fragment key={step}>
            <View style={styles.step} lightColor="transparent" darkColor="transparent">
              <View style={[styles.dot, { backgroundColor: reached ? tint : trackColor }, isCurrent && styles.dotCurrent]}>
                {reached && <Icon name="checkmark" size={11} color="#fff" />}
              </View>
              <Text style={[styles.label, reached ? { color: tint, fontWeight: '700' } : styles.labelMuted]}>{step}</Text>
            </View>
            {i < steps.length - 1 && <View style={[styles.line, { backgroundColor: i < currentIndex ? tint : trackColor }]} />}
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  step: { alignItems: 'center', width: 62 },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dotCurrent: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 2 },
  label: { fontSize: 10, marginTop: 5, textAlign: 'center' },
  labelMuted: { fontSize: 10, opacity: 0.4 },
  line: { flex: 1, height: 2, marginTop: 13, marginHorizontal: -8 },
});
