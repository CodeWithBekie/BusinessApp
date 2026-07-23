import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { apiClient, OrderListItem, OrderStatus } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { formatMoney, formatRelativeDate, ORDER_STATUS_COLORS, ORDER_STATUS_FILTERS } from '@/src/orders/orderStatus';

type FilterValue = OrderStatus | 'All';

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <View style={[styles.badge, { backgroundColor: ORDER_STATUS_COLORS[status] }]}>
      <Text style={styles.badgeText}>{status}</Text>
    </View>
  );
}

function OrderCard({ order, onPress }: { order: OrderListItem; onPress: () => void }) {
  const colorScheme = useColorScheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.cardInner} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
        <View style={styles.cardTopRow} lightColor="transparent" darkColor="transparent">
          <Text style={styles.customerName} numberOfLines={1}>
            {order.customerName ?? order.customerWhatsAppNumber}
          </Text>
          <StatusBadge status={order.status} />
        </View>
        <View style={styles.cardBottomRow} lightColor="transparent" darkColor="transparent">
          <Text style={styles.total}>{formatMoney(order.totalAmount, order.currency)}</Text>
          <Text style={[styles.meta, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
            {order.itemCount} item{order.itemCount === 1 ? '' : 's'} · {formatRelativeDate(order.createdAt)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function FilterTabs({ value, onChange }: { value: FilterValue; onChange: (value: FilterValue) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
      {ORDER_STATUS_FILTERS.map((filter) => {
        const active = filter === value;
        return (
          <Pressable key={filter} onPress={() => onChange(filter)} style={[styles.filterChip, active && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{filter}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function OrdersScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterValue>('All');
  const [items, setItems] = useState<OrderListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((status: FilterValue, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    apiClient
      .getOrders(status === 'All' ? undefined : status)
      .then((data) => {
        setItems(data);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setRefreshing(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      setItems(null);
      load(filter);
    }, [filter, load])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Orders</Text>
      <FilterTabs value={filter} onChange={setFilter} />
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(filter, true)} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24, paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  filterScroll: { flexGrow: 0 },
  filterRow: { gap: 8, paddingRight: 8, paddingBottom: 4 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  filterChipActive: { backgroundColor: '#007aff', borderColor: '#007aff' },
  filterChipText: { fontSize: 13, fontWeight: '500', opacity: 0.7 },
  filterChipTextActive: { color: '#fff', opacity: 1 },
  separator: { marginTop: 12, marginBottom: 12, height: 1, width: '100%' },
  loading: { marginTop: 24 },
  empty: { opacity: 0.6, marginTop: 8 },
  error: { color: '#c0392b', marginBottom: 12 },
  list: { width: '100%' },
  card: { marginBottom: 12, borderRadius: 10 },
  cardPressed: { opacity: 0.7 },
  cardInner: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 14 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  customerName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  total: { fontSize: 17, fontWeight: '700' },
  meta: { fontSize: 12 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
