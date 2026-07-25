import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { apiClient, MarketplaceOrderResult } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { formatMoney } from '@/src/common/format';
import { useIsOnline } from '@/src/offline/networkStatus';

interface CheckoutLine {
  catalogItemId: string;
  name: string;
  price: number;
  currency: string;
  quantity: number;
}

export default function CheckoutScreen() {
  const { businessId, items } = useLocalSearchParams<{ businessId: string; items: string }>();
  const router = useRouter();
  const isOnline = useIsOnline();

  const lines = useMemo<CheckoutLine[]>(() => {
    try {
      return JSON.parse(items ?? '[]');
    } catch {
      return [];
    }
  }, [items]);

  const currency = lines[0]?.currency ?? 'USD';
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MarketplaceOrderResult | null>(null);

  const placeOrder = useCallback(async () => {
    setError(null);
    setPlacing(true);
    try {
      const order = await apiClient.placeMarketplaceOrder(
        businessId,
        lines.map((line) => ({ catalogItemId: line.catalogItemId, quantity: line.quantity }))
      );
      setResult(order);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPlacing(false);
    }
  }, [businessId, lines]);

  if (result) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Order placed' }} />
        <View style={styles.successBanner} lightColor="#e8f5e9" darkColor="rgba(46,125,50,0.2)">
          <Text style={styles.successTitle}>Order placed — {formatMoney(result.totalAmount, result.currency)}</Text>
          <Text style={styles.successMeta}>From: {result.businessName}</Text>
          <Text style={styles.successMeta}>Reference: {result.paymentReference}</Text>
          {result.paymentInstructions && <Text style={styles.successMeta}>{result.paymentInstructions}</Text>}
        </View>
        <Pressable style={styles.doneButton} onPress={() => router.replace('/(customer)/orders')}>
          <Text style={styles.doneButtonText}>View my orders</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Checkout' }} />
      <Text style={styles.sectionTitle}>Order summary</Text>
      {lines.map((line) => (
        <View key={line.catalogItemId} style={styles.lineRow} lightColor="transparent" darkColor="transparent">
          <Text style={styles.lineName} numberOfLines={1}>
            {line.quantity} × {line.name}
          </Text>
          <Text style={styles.lineSubtotal}>{formatMoney(line.price * line.quantity, line.currency)}</Text>
        </View>
      ))}
      <View style={styles.totalRow} lightColor="transparent" darkColor="transparent">
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{formatMoney(total, currency)}</Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {!isOnline && <Text style={styles.error}>You're offline — connect to place this order.</Text>}

      <Pressable
        style={[styles.placeButton, (placing || !isOnline || lines.length === 0) && styles.buttonDisabled]}
        disabled={placing || !isOnline || lines.length === 0}
        onPress={placeOrder}
      >
        <Text style={styles.placeButtonText}>{placing ? 'Placing order…' : 'Place order'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  lineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  lineName: { fontSize: 14, flexShrink: 1 },
  lineSubtotal: { fontSize: 14, fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ccc' },
  totalLabel: { fontSize: 15, fontWeight: '700' },
  totalValue: { fontSize: 17, fontWeight: '800' },
  error: { color: '#c0392b', marginTop: 12 },
  placeButton: { backgroundColor: '#007aff', paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  buttonDisabled: { opacity: 0.6 },
  placeButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  successBanner: { borderRadius: 10, padding: 16, marginTop: 16 },
  successTitle: { fontSize: 16, fontWeight: '700' },
  successMeta: { fontSize: 13, opacity: 0.8, marginTop: 6 },
  doneButton: { backgroundColor: '#2e7d32', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  doneButtonText: { color: '#fff', fontWeight: '600' },
});
