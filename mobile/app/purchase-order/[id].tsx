import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { apiClient, PosPaymentMethod, PurchaseOrderDetail, ReceivedLinePrice } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { formatMoney } from '@/src/common/format';
import { downloadAndShareDocument } from '@/src/documents/downloadAndShare';
import { useCachedFetch } from '@/src/offline/useCachedFetch';
import { useIsOnline } from '@/src/offline/networkStatus';
import { useHasPermission } from '@/src/auth/permissions';

const SUPPLIER_PAYMENT_METHODS: readonly PosPaymentMethod[] = ['Cash', 'EcoCash', 'Bank', 'Other'];

const PO_STATUS_COLORS: Record<string, string> = {
  Draft: '#8e8e93',
  Ordered: '#f2994a',
  Received: '#2e7d32',
  Cancelled: '#c0392b',
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

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
            <Badge label={po.status} color={PO_STATUS_COLORS[po.status] ?? '#8e8e93'} />
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
                      {item.isNewItem && (
                        <View style={styles.newBadge}>
                          <Text style={styles.newBadgeText}>New</Text>
                        </View>
                      )}
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

          <Pressable
            style={[styles.secondaryButton, downloadingDocument && styles.buttonDisabled]}
            disabled={downloadingDocument}
            onPress={downloadDocument}
          >
            <Text style={styles.secondaryButtonText}>{downloadingDocument ? 'Preparing…' : 'Download document'}</Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/assistant',
                params: { attachUri: `business://purchase-orders/${po.id}`, attachLabel: `PO #${po.id.slice(0, 8)}` },
              })
            }
          >
            <Text style={styles.secondaryButtonText}>Ask Assistant about this</Text>
          </Pressable>

          {canManageSuppliers && po.amountOwed > 0 && !showPaymentForm && (
            <Pressable style={[styles.secondaryButton, !isOnline && styles.buttonDisabled]} disabled={!isOnline} onPress={() => setShowPaymentForm(true)}>
              <Text style={styles.secondaryButtonText}>Record payment to supplier</Text>
            </Pressable>
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
                {SUPPLIER_PAYMENT_METHODS.map((method) => {
                  const active = method === paymentProvider;
                  return (
                    <Pressable key={method} onPress={() => setPaymentProvider(method)} style={[styles.providerChip, active && styles.providerChipActive]}>
                      <Text style={[styles.providerChipText, active && styles.providerChipTextActive]}>{method}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {paymentError && <Text style={styles.error}>{paymentError}</Text>}
              <View style={styles.receiveActions} lightColor="transparent" darkColor="transparent">
                <Pressable style={styles.modalCancelButtonWide} onPress={() => setShowPaymentForm(false)} disabled={recordingPayment}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.button, styles.receiveConfirmButton, (recordingPayment || !isOnline) && styles.buttonDisabled]}
                  disabled={recordingPayment || !isOnline}
                  onPress={recordPayment}
                >
                  <Text style={styles.buttonText}>{recordingPayment ? 'Recording…' : 'Confirm payment'}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {po.status === 'Ordered' && !showReceiveForm && (
            <Pressable style={[styles.button, !isOnline && styles.buttonDisabled]} disabled={!isOnline} onPress={startReceiving}>
              <Text style={styles.buttonText}>Mark as received</Text>
            </Pressable>
          )}
          {po.status === 'Ordered' && !isOnline && <Text style={styles.offlineNotice}>You're offline — receiving is disabled.</Text>}

          {po.status === 'Ordered' && showReceiveForm && (
            <View style={styles.receiveActions} lightColor="transparent" darkColor="transparent">
              <Pressable style={styles.modalCancelButtonWide} onPress={() => setShowReceiveForm(false)} disabled={receiving}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.receiveConfirmButton, (receiving || !isOnline) && styles.buttonDisabled]}
                disabled={receiving || !isOnline}
                onPress={performReceive}
              >
                <Text style={styles.buttonText}>{receiving ? 'Confirming…' : 'Confirm receipt'}</Text>
              </Pressable>
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
  error: { color: '#c0392b', marginBottom: 12 },
  cacheNote: { opacity: 0.6, fontSize: 12, marginBottom: 12 },
  offlineNotice: { color: '#c0392b', fontSize: 12, marginTop: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  updatedAt: { fontSize: 12 },
  total: { fontSize: 30, fontWeight: '700', marginBottom: 4 },
  amountOwedNote: { fontSize: 13, marginBottom: 16 },
  paymentForm: { marginTop: 12, marginBottom: 4 },
  providerRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  providerChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: '#ccc' },
  providerChipActive: { backgroundColor: '#007aff', borderColor: '#007aff' },
  providerChipText: { fontSize: 13, fontWeight: '600', opacity: 0.7 },
  providerChipTextActive: { color: '#fff', opacity: 1 },
  section: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 14, marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '700', opacity: 0.5, textTransform: 'uppercase', marginBottom: 10 },
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
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  button: { backgroundColor: '#007aff', paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  secondaryButton: { borderWidth: 1, borderColor: '#007aff', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  secondaryButtonText: { color: '#007aff', fontWeight: '600' },
  newBadge: { backgroundColor: '#f2994a', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  newBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  priceRow: { marginTop: 8 },
  priceLabel: { fontSize: 11, marginBottom: 4 },
  priceInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: '#000' },
  receiveActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  receiveConfirmButton: { flex: 1, marginTop: 0 },
  modalCancelButtonWide: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#ccc' },
  modalCancelText: { fontWeight: '600' },
});
