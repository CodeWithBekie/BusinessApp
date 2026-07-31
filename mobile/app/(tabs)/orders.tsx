import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { apiClient, OrderListItem, OrderStatus } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { semanticColors, spacing, typography } from '@/constants/theme';
import { formatMoney, formatRelativeDate, ORDER_STATUS_COLORS, ORDER_STATUS_FILTERS } from '@/src/orders/orderStatus';
import { useCachedFetch } from '@/src/offline/useCachedFetch';

type FilterValue = OrderStatus | 'All';

function OrderCard({ order, onPress }: { order: OrderListItem; onPress: () => void }) {
  const colorScheme = useColorScheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cardWrap, pressed && styles.cardPressed]}>
      <Card>
        <View style={styles.cardTopRow} lightColor="transparent" darkColor="transparent">
          <Text style={styles.customerName} numberOfLines={1}>
            {order.customerName ?? order.customerWhatsAppNumber}
          </Text>
          <Badge label={order.status} color={ORDER_STATUS_COLORS[order.status]} />
        </View>
        <View style={styles.cardBottomRow} lightColor="transparent" darkColor="transparent">
          <Text style={styles.total}>{formatMoney(order.totalAmount, order.currency)}</Text>
          <Text style={[styles.meta, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
            {order.itemCount} item{order.itemCount === 1 ? '' : 's'} · {formatRelativeDate(order.createdAt)}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

function FilterTabs({ value, onChange }: { value: FilterValue; onChange: (value: FilterValue) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
      {ORDER_STATUS_FILTERS.map((filter) => (
        <Chip key={filter} label={filter} active={filter === value} onPress={() => onChange(filter)} />
      ))}
    </ScrollView>
  );
}

export default function OrdersScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterValue>('All');
  const fetchOrders = useCallback(() => apiClient.getOrders(filter === 'All' ? undefined : filter), [filter]);
  const { data: items, error, refreshing, isFromCache, reload: load } = useCachedFetch<OrderListItem[]>(`orders:${filter}`, fetchOrders);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Orders</Text>
      <FilterTabs value={filter} onChange={setFilter} />
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && items === null && <ActivityIndicator style={styles.loading} />}
      {!error && items !== null && items.length === 0 && (
        <Text style={styles.empty}>No {filter === 'All' ? '' : filter.toLowerCase() + ' '}orders yet.</Text>
      )}
      {!error && items !== null && items.length > 0 && (
        <FlatList
          style={styles.list}
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <OrderCard order={item} onPress={() => router.push({ pathname: '/order/[id]', params: { id: item.id } })} />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24, paddingHorizontal: 16 },
  title: { ...typography.title, marginBottom: spacing.md },
  filterScroll: { flexGrow: 0 },
  filterRow: { gap: spacing.sm, paddingRight: spacing.sm, paddingBottom: 4 },
  separator: { marginTop: 12, marginBottom: 12, height: 1, width: '100%' },
  loading: { marginTop: 24 },
  empty: { opacity: 0.6, marginTop: 8 },
  error: { color: semanticColors.danger, marginBottom: 12 },
  cacheNote: { opacity: 0.6, fontSize: 12, marginBottom: 12 },
  list: { width: '100%' },
  cardWrap: { marginBottom: spacing.md },
  cardPressed: { opacity: 0.7 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  customerName: { ...typography.bodyStrong, flexShrink: 1 },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm + 2 },
  total: { fontSize: 17, fontWeight: '700' },
  meta: { ...typography.meta },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
});
