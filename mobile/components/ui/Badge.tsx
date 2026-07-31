import { StyleSheet } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { Text, View } from '@/components/Themed';
import { Icon } from './Icon';

// Mirrors customer-order/[id].tsx's existing Badge exactly (icon + colored pill) — one shared
// version instead of every business screen having its own icon-less, color-only badge.
export function Badge({ label, color, icon }: { label: string; color: string; icon?: SFSymbol }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]} lightColor="transparent" darkColor="transparent">
      {icon && <Icon name={icon} size={11} color="#fff" />}
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, alignSelf: 'flex-start' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
