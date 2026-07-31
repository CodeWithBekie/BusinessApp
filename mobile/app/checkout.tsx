import { SymbolView } from 'expo-symbols';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { apiClient, MarketplaceOrderResult } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { semanticColors } from '@/constants/theme';
import { useColorScheme } from '@/components/useColorScheme';
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
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;

  const lines = useMemo<CheckoutLine[]>(() => {
    try {
      return JSON.parse(items ?? '[]');
    } catch {
      return [];
    }
  }, [items]);

  const currency = lines[0]?.currency ?? 'USD';
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

  const [vatRate, setVatRate] = useState(0);
  const vatAmount = Math.round(total * vatRate * 100) / 100;
  const grandTotal = total + vatAmount;

  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MarketplaceOrderResult | null>(null);

  useEffect(() => {
    apiClient
      .getMarketplaceBusiness(businessId)
      .then((business) => setVatRate(business.vatRate))
      .catch(() => {});
  }, [businessId]);

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
          <SymbolView name={{ ios: 'checkmark.circle.fill', android: 'code', web: 'code' }} tintColor={semanticColors.success} size={40} style={styles.successIcon} />
          <Text style={styles.successTitle}>Order placed — {formatMoney(result.totalAmount, result.currency)}</Text>
          <Text style={styles.successMeta}>From: {result.businessName}</Text>
          <Text style={styles.successMeta}>Reference: {result.paymentReference}</Text>
          {result.paymentInstructions && <Text style={styles.successMeta}>{result.paymentInstructions}</Text>}
        </View>
        <Button label="View my orders" variant="success" onPress={() => router.replace('/(customer)/orders')} style={styles.doneButton} />
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
      {vatRate > 0 && (
        <>
          <View style={styles.lineRow} lightColor="transparent" darkColor="transparent">
            <Text style={styles.lineName}>Subtotal</Text>
            <Text style={styles.lineSubtotal}>{formatMoney(total, currency)}</Text>
          </View>
          <View style={styles.lineRow} lightColor="transparent" darkColor="transparent">
            <Text style={styles.lineName}>VAT ({(vatRate * 100).toFixed(vatRate * 100 % 1 === 0 ? 0 : 2)}%)</Text>
            <Text style={styles.lineSubtotal}>{formatMoney(vatAmount, currency)}</Text>
          </View>
        </>
      )}
      <View style={styles.totalRow} lightColor="transparent" darkColor="transparent">
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={[styles.totalValue, { color: tint }]}>{formatMoney(grandTotal, currency)}</Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {!isOnline && <Text style={styles.error}>You're offline — connect to place this order.</Text>}

      <Button
        label={placing ? 'Placing order…' : 'Place order'}
        disabled={placing || !isOnline || lines.length === 0}
        onPress={placeOrder}
        style={styles.placeButton}
      />
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
  error: { color: semanticColors.danger, marginTop: 12 },
  placeButton: { marginTop: 20 },
  successBanner: { borderRadius: 14, padding: 20, marginTop: 16, alignItems: 'center' },
  successIcon: { marginBottom: 10 },
  successTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  successMeta: { fontSize: 13, opacity: 0.8, marginTop: 6, textAlign: 'center' },
  doneButton: { marginTop: 16 },
});
