import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput } from 'react-native';

import { apiClient, OrderDetail, OrderPayment } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { downloadAndShareDocument } from '@/src/documents/downloadAndShare';
import { formatMoney, ORDER_STATUS_COLORS } from '@/src/orders/orderStatus';

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  Pending: '#f2994a',
  Confirmed: '#2e7d32',
  Failed: '#c0392b',
};

const PAYMENT_PROVIDERS: readonly OrderPayment['provider'][] = ['Cash', 'EcoCash', 'Bank', 'Other'];

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

function ProviderChips({
  value,
  onChange,
}: {
  value: OrderPayment['provider'];
  onChange: (provider: OrderPayment['provider']) => void;
}) {
  return (
    <View style={styles.providerRow} lightColor="transparent" darkColor="transparent">
      {PAYMENT_PROVIDERS.map((provider) => {
        const active = provider === value;
        return (
          <Pressable key={provider} onPress={() => onChange(provider)} style={[styles.providerChip, active && styles.providerChipActive]}>
            <Text style={[styles.providerChipText, active && styles.providerChipTextActive]}>{provider}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const metaStyle = colorScheme === 'dark' ? styles.metaDark : styles.metaLight;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fulfilling, setFulfilling] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);

  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<OrderPayment['provider']>('Cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [showEditProvider, setShowEditProvider] = useState(false);
  const [editProvider, setEditProvider] = useState<OrderPayment['provider']>('Cash');
  const [updatingProvider, setUpdatingProvider] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    apiClient
      .getOrder(id)
      .then((data) => {
        setOrder(data);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const performFulfill = useCallback(async () => {
    if (!order) return;
    setConfirmVisible(false);
    setActionError(null);
    setFulfilling(true);
    try {
      await apiClient.markOrderFulfilled(order.id);
      load();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setFulfilling(false);
    }
  }, [order, load]);

  const performSendInvoice = useCallback(async () => {
    if (!order) return;
    setActionError(null);
    setInvoicing(true);
    try {
      await apiClient.createInvoice(order.customerId);
      load();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setInvoicing(false);
    }
  }, [order, load]);

  const downloadReceipt = useCallback(async () => {
    if (!order) return;
    setActionError(null);
    setDownloadingReceipt(true);
    try {
      await downloadAndShareDocument(`/api/orders/${order.id}/receipt`, `receipt-${order.id.slice(0, 8)}.pdf`);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setDownloadingReceipt(false);
    }
  }, [order]);

  const startRecordPayment = useCallback(() => {
    if (!order) return;
    setPaymentError(null);
    setPaymentProvider('Cash');
    setPaymentReference('');
    setPaymentAmount(order.totalAmount.toFixed(2));
    setShowRecordPayment(true);
  }, [order]);

  const submitRecordPayment = useCallback(async () => {
    if (!order) return;
    if (!paymentReference.trim()) {
      setPaymentError('A payment reference is required.');
      return;
    }
    const parsedAmount = Number(paymentAmount);
    if (!paymentAmount.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setPaymentError('Enter a valid amount greater than zero.');
      return;
    }
    setPaymentError(null);
    setRecordingPayment(true);
    try {
      await apiClient.recordOrderPayment(order.id, paymentProvider, paymentReference.trim(), parsedAmount);
      setShowRecordPayment(false);
      load();
    } catch (err) {
      setPaymentError((err as Error).message);
    } finally {
      setRecordingPayment(false);
    }
  }, [order, paymentProvider, paymentReference, paymentAmount, load]);

  const startEditProvider = useCallback(() => {
    if (!order?.payment) return;
    setEditProvider(order.payment.provider);
    setShowEditProvider(true);
    setActionError(null);
  }, [order]);

  const submitEditProvider = useCallback(async () => {
    if (!order) return;
    setActionError(null);
    setUpdatingProvider(true);
    try {
      await apiClient.updateOrderPaymentProvider(order.id, editProvider);
      setShowEditProvider(false);
      load();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setUpdatingProvider(false);
    }
  }, [order, editProvider, load]);

  const locked = order?.status === 'Fulfilled' || order?.status === 'Cancelled';
  const hasConfirmedPayment = order?.payment?.status === 'Confirmed';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: order ? `Order #${order.id.slice(0, 8)}` : 'Order' }} />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {!error && order === null && <ActivityIndicator style={styles.loading} />}
      {!error && order !== null && (
        <>
          <View style={styles.headerRow} lightColor="transparent" darkColor="transparent">
            <Badge label={order.status} color={ORDER_STATUS_COLORS[order.status]} />
            <Text style={[styles.updatedAt, metaStyle]}>Updated {new Date(order.updatedAt).toLocaleString()}</Text>
          </View>

          <Text style={styles.total}>{formatMoney(order.totalAmount, order.currency)}</Text>

          <Section title="Customer">
            <Text style={styles.rowPrimary}>{order.customerName ?? 'No name on file'}</Text>
            <Text style={[styles.rowSecondary, metaStyle]}>{order.customerWhatsAppNumber}</Text>
          </Section>

          <Section title={`Items (${order.items.length})`}>
            {order.items.map((item) => (
              <View key={item.catalogItemId} style={styles.itemRow} lightColor="transparent" darkColor="transparent">
                <View style={styles.itemNameCol} lightColor="transparent" darkColor="transparent">
                  <Text style={styles.rowPrimary} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.rowSecondary, metaStyle]}>
                    {item.quantity} × {formatMoney(item.unitPrice, order.currency)}
                  </Text>
                </View>
                <Text style={styles.itemSubtotal}>{formatMoney(item.subtotal, order.currency)}</Text>
              </View>
            ))}
          </Section>

          {order.payment && (
            <Section title="Payment">
              <View style={styles.headerRow} lightColor="transparent" darkColor="transparent">
                <Text style={styles.rowPrimary}>{order.payment.provider}</Text>
                <Badge label={order.payment.status} color={PAYMENT_STATUS_COLORS[order.payment.status] ?? '#8e8e93'} />
              </View>
              <Text style={[styles.rowSecondary, metaStyle]}>Ref: {order.payment.providerReference}</Text>
              {order.payment.confirmedAt && (
                <Text style={[styles.rowSecondary, metaStyle]}>Confirmed {new Date(order.payment.confirmedAt).toLocaleString()}</Text>
              )}

              {hasConfirmedPayment && !locked && !showEditProvider && (
                <Pressable style={styles.inlineEditButton} onPress={startEditProvider}>
                  <Text style={styles.inlineEditButtonText}>Edit provider</Text>
                </Pressable>
              )}

              {showEditProvider && (
                <View style={styles.inlineForm} lightColor="transparent" darkColor="transparent">
                  <ProviderChips value={editProvider} onChange={setEditProvider} />
                  <View style={styles.inlineFormActions} lightColor="transparent" darkColor="transparent">
                    <Pressable style={styles.modalCancelButtonWide} onPress={() => setShowEditProvider(false)} disabled={updatingProvider}>
                      <Text style={styles.modalCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.button, styles.inlineFormConfirmButton, updatingProvider && styles.buttonDisabled]}
                      disabled={updatingProvider}
                      onPress={submitEditProvider}
                    >
                      <Text style={styles.buttonText}>{updatingProvider ? 'Saving…' : 'Save'}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </Section>
          )}

          {!hasConfirmedPayment && !locked && (
            <Section title="Payment">
              {!order.payment && <Text style={[styles.rowSecondary, metaStyle]}>No payment recorded yet.</Text>}
              {!showRecordPayment && (
                <Pressable style={styles.inlineEditButton} onPress={startRecordPayment}>
                  <Text style={styles.inlineEditButtonText}>Record payment</Text>
                </Pressable>
              )}
              {showRecordPayment && (
                <View style={styles.inlineForm} lightColor="transparent" darkColor="transparent">
                  <ProviderChips value={paymentProvider} onChange={setPaymentProvider} />
                  <TextInput
                    style={[styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight]}
                    placeholder="Payment reference (e.g. receipt/transaction number)"
                    value={paymentReference}
                    onChangeText={setPaymentReference}
                  />
                  <Text style={[styles.rowSecondary, metaStyle]}>Amount ({order.currency})</Text>
                  <TextInput
                    style={[styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight]}
                    placeholder={order.totalAmount.toFixed(2)}
                    value={paymentAmount}
                    onChangeText={setPaymentAmount}
                    keyboardType="decimal-pad"
                  />
                  {paymentError && <Text style={styles.error}>{paymentError}</Text>}
                  <View style={styles.inlineFormActions} lightColor="transparent" darkColor="transparent">
                    <Pressable style={styles.modalCancelButtonWide} onPress={() => setShowRecordPayment(false)} disabled={recordingPayment}>
                      <Text style={styles.modalCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.button, styles.inlineFormConfirmButton, recordingPayment && styles.buttonDisabled]}
                      disabled={recordingPayment}
                      onPress={submitRecordPayment}
                    >
                      <Text style={styles.buttonText}>{recordingPayment ? 'Recording…' : 'Confirm payment'}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </Section>
          )}

          <Text style={[styles.createdAt, metaStyle]}>Order placed {new Date(order.createdAt).toLocaleString()}</Text>

          {actionError && <Text style={styles.error}>{actionError}</Text>}

          {order.payment && (
            <Pressable
              style={[styles.secondaryButton, downloadingReceipt && styles.buttonDisabled]}
              disabled={downloadingReceipt}
              onPress={downloadReceipt}
            >
              <Text style={styles.secondaryButtonText}>{downloadingReceipt ? 'Preparing…' : 'Download receipt'}</Text>
            </Pressable>
          )}

          {order.status === 'Quoted' && (
            <Pressable style={[styles.button, invoicing && styles.buttonDisabled]} disabled={invoicing} onPress={performSendInvoice}>
              <Text style={styles.buttonText}>{invoicing ? 'Sending invoice…' : 'Send invoice'}</Text>
            </Pressable>
          )}

          <Pressable
            style={styles.secondaryButton}
            onPress={() =>
              router.push({ pathname: '/(tabs)/assistant', params: { attachUri: `business://orders/${order.id}`, attachLabel: `Order #${order.id.slice(0, 8)}` } })
            }
          >
            <Text style={styles.secondaryButtonText}>Ask Assistant about this</Text>
          </Pressable>

          {order.status === 'Paid' && (
            <Pressable
              style={[styles.button, fulfilling && styles.buttonDisabled]}
              disabled={fulfilling}
              onPress={() => setConfirmVisible(true)}
            >
              <Text style={styles.buttonText}>{fulfilling ? 'Marking fulfilled…' : 'Mark as fulfilled'}</Text>
            </Pressable>
          )}
        </>
      )}

      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.modalOverlay} lightColor="rgba(0,0,0,0.4)" darkColor="rgba(0,0,0,0.6)">
          <View style={styles.modalCard} lightColor="#fff" darkColor="#1c1c1e">
            <Text style={styles.modalTitle}>Mark as fulfilled?</Text>
            <Text style={[styles.modalBody, metaStyle]}>This confirms the order has been delivered to the customer.</Text>
            <View style={styles.modalActions} lightColor="transparent" darkColor="transparent">
              <Pressable style={[styles.modalButton, styles.modalCancelButton]} onPress={() => setConfirmVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalButton, styles.button]} onPress={performFulfill}>
                <Text style={styles.buttonText}>Mark fulfilled</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 32 },
  loading: { marginTop: 40 },
  error: { color: '#c0392b', marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  updatedAt: { fontSize: 12 },
  total: { fontSize: 30, fontWeight: '700', marginBottom: 20 },
  section: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 14, marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '700', opacity: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  rowPrimary: { fontSize: 15, fontWeight: '600' },
  rowSecondary: { fontSize: 13, marginTop: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  itemNameCol: { flexShrink: 1, paddingRight: 12 },
  itemSubtotal: { fontSize: 14, fontWeight: '600' },
  createdAt: { fontSize: 12, marginBottom: 8 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  button: { backgroundColor: '#007aff', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  secondaryButton: { borderWidth: 1, borderColor: '#007aff', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  secondaryButtonText: { color: '#007aff', fontWeight: '600' },
  inlineEditButton: { marginTop: 10 },
  inlineEditButtonText: { color: '#007aff', fontWeight: '600', fontSize: 13 },
  inlineForm: { marginTop: 10, gap: 8 },
  inlineFormActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  inlineFormConfirmButton: { flex: 1 },
  providerRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  providerChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: '#ccc' },
  providerChipActive: { backgroundColor: '#007aff', borderColor: '#007aff' },
  providerChipText: { fontSize: 13, fontWeight: '500', opacity: 0.7 },
  providerChipTextActive: { color: '#fff', opacity: 1 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  modalBody: { fontSize: 14, marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalCancelButton: { borderWidth: 1, borderColor: '#ccc' },
  modalCancelButtonWide: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#ccc' },
  modalCancelText: { fontWeight: '600' },
});
