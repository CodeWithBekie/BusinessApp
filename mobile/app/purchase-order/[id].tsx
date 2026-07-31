import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Section } from '@/components/ui/Section';
import { apiClient, PosPaymentMethod, PurchaseOrderDetail, ReceivedLinePrice } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { semanticColors, spacing } from '@/constants/theme';
import { formatMoney } from '@/src/common/format';
import { downloadAndShareDocument } from '@/src/documents/downloadAndShare';
import { useCachedFetch } from '@/src/offline/useCachedFetch';
import { useIsOnline } from '@/src/offline/networkStatus';
import { useHasPermission } from '@/src/auth/permissions';

const SUPPLIER_PAYMENT_METHODS: readonly PosPaymentMethod[] = ['Cash', 'EcoCash', 'Bank', 'Other'];

const PO_STATUS_COLORS: Record<string, string> = {
  Draft: semanticColors.neutral,
  Ordered: semanticColors.warning,
  Received: semanticColors.success,
  Cancelled: semanticColors.danger,
};

export default function PurchaseOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isOnline = useIsOnline();
  const canManageSuppliers = useHasPermission('ManageSuppliers');
  const metaStyle = colorScheme === 'dark' ? styles.metaDark : styles.metaLight;
  const fetchPo = useCallback(() => apiClient.getPurchaseOrder(id!), [id]);
  const { data: po, error, isFromCache, reload: load } = useCachedFetch<PurchaseOrderDetail>(`purchaseOrder:${id}`, fetchPo);
  const [receiving, setReceiving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [receivePrices, setReceivePrices] = useState<Record<string, string>>({});
  const [downloadingDocument, setDownloadingDocument] = useState(false);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentProvider, setPaymentProvider] = useState<PosPaymentMethod>('Cash');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const startReceiving = useCallback(() => {
    if (!po) return;
    const initial: Record<string, string> = {};
    for (const item of po.items) {
      initial[item.id] = item.isNewItem ? '' : (item.currentPrice ?? 0).toFixed(2);
    }
    setReceivePrices(initial);
    setActionError(null);
    setShowReceiveForm(true);
  }, [po]);

  const setPriceFor = useCallback((itemId: string, value: string) => {
    setReceivePrices((prev) => ({ ...prev, [itemId]: value }));
  }, []);

  const performReceive = useCallback(async () => {
    if (!po) return;
    setActionError(null);
    setReceiving(true);
    try {
      const linePrices: ReceivedLinePrice[] = po.items.map((item) => {
        const raw = receivePrices[item.id];
        const parsed = raw !== undefined && raw.trim() !== '' ? Number(raw) : null;
        return { purchaseOrderItemId: item.id, salePrice: parsed };
      });
      await apiClient.receivePurchaseOrder(po.id, linePrices);
      setShowReceiveForm(false);
      load();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setReceiving(false);
    }
  }, [po, receivePrices, load]);

  const recordPayment = useCallback(async () => {
    if (!po) return;
    setPaymentError(null);
    const parsed = Number(paymentAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setPaymentError('Enter a valid amount greater than zero.');
      return;
    }
    setRecordingPayment(true);
    try {
      await apiClient.recordSupplierPayment(po.id, parsed, paymentProvider);
      setShowPaymentForm(false);
      setPaymentAmount('');
      load();
    } catch (err) {
      setPaymentError((err as Error).message);
    } finally {
      setRecordingPayment(false);
    }
  }, [po, paymentAmount, paymentProvider, load]);

  const downloadDocument = useCallback(async () => {
    if (!po) return;
    setActionError(null);
    setDownloadingDocument(true);
    try {
      await downloadAndShareDocument(`/api/purchase-orders/${po.id}/document`, `purchase-order-${po.id.slice(0, 8)}.pdf`);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setDownloadingDocument(false);
    }
  }, [po]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: po ? `PO #${po.id.slice(0, 8)}` : 'Purchase order' }} />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && po === null && <ActivityIndicator style={styles.loading} />}
      {!error && po !== null && (
        <>
          <View style={styles.headerRow} lightColor="transparent" darkColor="transparent">
            <Badge label={po.status} color={PO_STATUS_COLORS[po.status] ?? semanticColors.neutral} />
            <Text style={[styles.updatedAt, metaStyle]}>Updated {new Date(po.updatedAt).toLocaleString()}</Text>
          </View>

          <Text style={styles.total}>{formatMoney(po.totalAmount, po.currency)}</Text>
          <Text style={[styles.amountOwedNote, metaStyle]}>
            Paid {formatMoney(po.amountPaid, po.currency)} · Owed {formatMoney(po.amountOwed, po.currency)}
          </Text>

          <Section title="Supplier">
            <Text style={styles.rowPrimary}>{po.supplierName}</Text>
          </Section>

          <Section title={`Items (${po.items.length})`}>
            {po.items.map((item) => (
              <View key={item.id} style={styles.itemBlock} lightColor="transparent" darkColor="transparent">
                <View style={styles.itemRow} lightColor="transparent" darkColor="transparent">
                  <View style={styles.itemNameCol} lightColor="transparent" darkColor="transparent">
                    <View style={styles.itemNameRow} lightColor="transparent" darkColor="transparent">
                      <Text style={styles.rowPrimary} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.isNewItem && <Badge label="New" color={semanticColors.warning} />}
                    </View>
                    <Text style={[styles.rowSecondary, metaStyle]}>
                      {item.quantity} × {formatMoney(item.unitCost, po.currency)}
                      {!item.isNewItem && item.currentPrice != null ? ` · sells at ${formatMoney(item.currentPrice, po.currency)}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.itemSubtotal}>{formatMoney(item.subtotal, po.currency)}</Text>
                </View>

                {showReceiveForm && (
                  <View style={styles.priceRow} lightColor="transparent" darkColor="transparent">
                    <Text style={[styles.priceLabel, metaStyle]}>
                      {item.isNewItem ? `Sale price (required, ${po.currency})` : `New sale price (optional, ${po.currency})`}
                    </Text>
                    <TextInput
                      style={styles.priceInput}
                      value={receivePrices[item.id] ?? ''}
                      onChangeText={(value) => setPriceFor(item.id, value)}
                      keyboardType="decimal-pad"
                      placeholder={item.isNewItem ? 'e.g. 25.00' : formatMoney(item.currentPrice ?? 0, po.currency)}
                    />
                  </View>
                )}
              </View>
            ))}
          </Section>

          {po.receivedAt && <Text style={[styles.createdAt, metaStyle]}>Received {new Date(po.receivedAt).toLocaleString()}</Text>}
          <Text style={[styles.createdAt, metaStyle]}>Created {new Date(po.createdAt).toLocaleString()}</Text>

          {actionError && <Text style={styles.error}>{actionError}</Text>}

          <Button
            label={downloadingDocument ? 'Preparing…' : 'Download document'}
            variant="secondary"
            style={styles.spacedButton}
            disabled={downloadingDocument}
            onPress={downloadDocument}
          />

          <Button
            label="Ask Assistant about this"
            variant="secondary"
            style={styles.spacedButton}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/assistant',
                params: { attachUri: `business://purchase-orders/${po.id}`, attachLabel: `PO #${po.id.slice(0, 8)}` },
              })
            }
          />

          {canManageSuppliers && po.amountOwed > 0 && !showPaymentForm && (
            <Button label="Record payment to supplier" variant="secondary" style={styles.spacedButton} disabled={!isOnline} onPress={() => setShowPaymentForm(true)} />
          )}

          {showPaymentForm && (
            <View style={styles.paymentForm} lightColor="transparent" darkColor="transparent">
              <Text style={[styles.priceLabel, metaStyle]}>Amount ({po.currency})</Text>
              <TextInput
                style={styles.priceInput}
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                keyboardType="decimal-pad"
                placeholder={formatMoney(po.amountOwed, po.currency)}
              />
              <View style={styles.providerRow} lightColor="transparent" darkColor="transparent">
                {SUPPLIER_PAYMENT_METHODS.map((method) => (
                  <Chip key={method} label={method} active={method === paymentProvider} onPress={() => setPaymentProvider(method)} />
                ))}
              </View>
              {paymentError && <Text style={styles.error}>{paymentError}</Text>}
              <View style={styles.receiveActions} lightColor="transparent" darkColor="transparent">
                <Button label="Cancel" variant="secondary" style={styles.flexButton} onPress={() => setShowPaymentForm(false)} disabled={recordingPayment} />
                <Button
                  label={recordingPayment ? 'Recording…' : 'Confirm payment'}
                  style={styles.flexButton}
                  disabled={recordingPayment || !isOnline}
                  onPress={recordPayment}
                />
              </View>
            </View>
          )}

          {po.status === 'Ordered' && !showReceiveForm && (
            <Button label="Mark as received" style={styles.spacedButton} disabled={!isOnline} onPress={startReceiving} />
          )}
          {po.status === 'Ordered' && !isOnline && <Text style={styles.offlineNotice}>You're offline — receiving is disabled.</Text>}

          {po.status === 'Ordered' && showReceiveForm && (
            <View style={styles.receiveActions} lightColor="transparent" darkColor="transparent">
              <Button label="Cancel" variant="secondary" style={styles.flexButton} onPress={() => setShowReceiveForm(false)} disabled={receiving} />
              <Button
                label={receiving ? 'Confirming…' : 'Confirm receipt'}
                style={styles.flexButton}
                disabled={receiving || !isOnline}
                onPress={performReceive}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 32 },
  loading: { marginTop: 40 },
  error: { color: semanticColors.danger, marginBottom: 12 },
  cacheNote: { opacity: 0.6, fontSize: 12, marginBottom: 12 },
  offlineNotice: { color: semanticColors.danger, fontSize: 12, marginTop: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  updatedAt: { fontSize: 12 },
  total: { fontSize: 30, fontWeight: '700', marginBottom: 4 },
  amountOwedNote: { fontSize: 13, marginBottom: 16 },
  paymentForm: { marginTop: 12, marginBottom: 4 },
  providerRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 10, flexWrap: 'wrap' },
  rowPrimary: { fontSize: 15, fontWeight: '600' },
  rowSecondary: { fontSize: 13, marginTop: 2 },
  itemBlock: { marginBottom: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemNameCol: { flexShrink: 1, paddingRight: 12 },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemSubtotal: { fontSize: 14, fontWeight: '600' },
  createdAt: { fontSize: 12, marginBottom: 8 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  spacedButton: { marginTop: spacing.md },
  priceRow: { marginTop: 8 },
  priceLabel: { fontSize: 11, marginBottom: 4 },
  priceInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: '#000' },
  receiveActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  flexButton: { flex: 1 },
});
