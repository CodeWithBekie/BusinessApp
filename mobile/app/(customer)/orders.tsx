import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from 'react-native';

import { apiClient, MarketplaceOrderSummary, OrderStatus } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { ORDER_STATUS_COLORS } from '@/src/orders/orderStatus';
import { formatMoney } from '@/src/common/format';
import { useCachedFetch } from '@/src/offline/useCachedFetch';

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <View style={[styles.badge, { backgroundColor: ORDER_STATUS_COLORS[status] }]}>
      <Text style={styles.badgeText}>{status}</Text>
    </View>
  );
}

function OrderCard({ order }: { order: MarketplaceOrderSummary }) {
  return (
    <View style={styles.card} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
      <View style={styles.cardTopRow} lightColor="transparent" darkColor="transparent">
        <Text style={styles.businessName} numberOfLines={1}>
          {order.businessName}
        </Text>
        <StatusBadge status={order.status} />
      </View>
      <View style={styles.cardBottomRow} lightColor="transparent" darkColor="transparent">
        <Text style={styles.total}>{formatMoney(order.totalAmount, order.currency)}</Text>
        <Text style={styles.meta}>
          {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
        </Text>
      </View>
    </View>
  );
}

export default function MyOrdersScreen() {
  const fetchOrders = useCallback(() => apiClient.getMyMarketplaceOrders(), []);
  const { data: orders, error, refreshing, isFromCache, reload: load } = useCachedFetch<MarketplaceOrderSummary[]>(
    'marketplace:my-orders',
    fetchOrders
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Orders</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && orders === null && <ActivityIndicator style={styles.loading} />}
      {!error && orders !== null && orders.length === 0 && <Text style={styles.empty}>No orders yet.</Text>}
      {!error && orders !== null && orders.length > 0 && (
        <FlatList
          style={styles.list}
          data={orders}
          keyExtractor={(item) => item.orderId}
          renderItem={({ item }) => <OrderCard order={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24, paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: 'bold' },
  separator: { marginTop: 12, marginBottom: 12, height: 1, width: '100%' },
  loading: { marginTop: 24 },
  empty: { opacity: 0.6, marginTop: 8 },
  error: { color: '#c0392b', marginBottom: 12 },
  cacheNote: { opacity: 0.6, fontSize: 12, marginBottom: 12 },
  list: { width: '100%' },
  card: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 14, marginBottom: 12 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  businessName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  total: { fontSize: 17, fontWeight: '700' },
  meta: { fontSize: 12, opacity: 0.6 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
