import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { apiClient, MarketplaceOrderSummary, OrderStatus } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { semanticColors, spacing } from '@/constants/theme';
import { colorFor, initialsFor } from '@/src/marketplace/avatar';
import { ORDER_STATUS_COLORS } from '@/src/orders/orderStatus';
import { formatMoney } from '@/src/common/format';
import { useCachedFetch } from '@/src/offline/useCachedFetch';

const STATUS_ICONS: Record<OrderStatus, SFSymbol> = {
  Quoted: 'doc.text',
  Invoiced: 'clock',
  Paid: 'checkmark.circle',
  Fulfilled: 'checkmark.seal',
  Cancelled: 'xmark.circle',
};

function BusinessAvatar({ name }: { name: string }) {
  return (
    <View style={[styles.avatar, { backgroundColor: colorFor(name) }]} lightColor="transparent" darkColor="transparent">
      <Text style={styles.avatarText}>{initialsFor(name)}</Text>
    </View>
  );
}

function OrderCard({ order }: { order: MarketplaceOrderSummary }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/customer-order/[id]', params: { id: order.orderId } })}>
      <Card style={styles.card}>
        <View style={styles.cardTopRow} lightColor="transparent" darkColor="transparent">
          <View style={styles.businessRow} lightColor="transparent" darkColor="transparent">
            <BusinessAvatar name={order.businessName} />
            <Text style={styles.businessName} numberOfLines={1}>
              {order.businessName}
            </Text>
          </View>
          <Badge label={order.status} color={ORDER_STATUS_COLORS[order.status]} icon={STATUS_ICONS[order.status]} />
        </View>
        <View style={styles.cardBottomRow} lightColor="transparent" darkColor="transparent">
          <Text style={styles.total}>{formatMoney(order.totalAmount, order.currency)}</Text>
          <Text style={styles.meta}>
            {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
          </Text>
        </View>
      </Card>
    </Pressable>
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
      {!error && orders === null && <ActivityIndicator style={styles.loadingCentered} />}
      {!error && orders !== null && orders.length === 0 && (
        <View style={styles.emptyState} lightColor="transparent" darkColor="transparent">
          <Icon name="bag" color={semanticColors.neutral} size={48} />
          <Text style={styles.empty}>No orders yet.</Text>
          <Button label="Browse businesses" onPress={() => router.push('/(customer)')} style={styles.browseButton} />
        </View>
      )}
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
  loadingCentered: { flex: 1, justifyContent: 'center' },
  empty: { opacity: 0.6, marginTop: 12 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  browseButton: { marginTop: 20 },
  error: { color: semanticColors.danger, marginBottom: 12 },
  cacheNote: { opacity: 0.6, fontSize: 12, marginBottom: 12 },
  list: { width: '100%' },
  card: { marginBottom: spacing.md },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  businessRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  businessName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  total: { fontSize: 17, fontWeight: '700' },
  meta: { fontSize: 12, opacity: 0.6 },
});
