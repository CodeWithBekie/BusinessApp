import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Section } from '@/components/ui/Section';
import { apiClient, DeliveryInfo, OrderDetail, OrderPayment } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { semanticColors, spacing, typography } from '@/constants/theme';
import { downloadAndShareDocument } from '@/src/documents/downloadAndShare';
import { formatMoney, ORDER_STATUS_COLORS } from '@/src/orders/orderStatus';
import { useCachedFetch } from '@/src/offline/useCachedFetch';
import { useIsOnline } from '@/src/offline/networkStatus';
import { useConfirm } from '@/src/ui/ConfirmContext';
import { useToast } from '@/src/ui/ToastContext';

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  Pending: semanticColors.warning,
  Confirmed: semanticColors.success,
  Failed: semanticColors.danger,
};

const PAYMENT_PROVIDERS: readonly OrderPayment['provider'][] = ['Cash', 'EcoCash', 'Bank', 'Other'];

const DELIVERY_STATUS_COLORS: Record<string, string> = {
  Pending: semanticColors.neutral,
  Assigned: semanticColors.warning,
  InTransit: '#2f80ed',
  Delivered: semanticColors.success,
};

function ProviderChips({
  value,
  onChange,
}: {
  value: OrderPayment['provider'];
  onChange: (provider: OrderPayment['provider']) => void;
}) {
  return (
    <View style={styles.providerRow} lightColor="transparent" darkColor="transparent">
      {PAYMENT_PROVIDERS.map((provider) => (
        <Chip key={provider} label={provider} active={provider === value} onPress={() => onChange(provider)} />
      ))}
    </View>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isOnline = useIsOnline();
  const metaStyle = colorScheme === 'dark' ? styles.metaDark : styles.metaLight;
  const { confirm } = useConfirm();
  const { show: showToast } = useToast();
  const fetchOrder = useCallback(() => apiClient.getOrder(id!), [id]);
  const { data: order, error, isFromCache, reload: load } = useCachedFetch<OrderDetail>(`order:${id}`, fetchOrder);
  const [fulfilling, setFulfilling] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);

  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<OrderPayment['provider']>('Cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [showEditPayment, setShowEditPayment] = useState(false);
  const [editProvider, setEditProvider] = useState<OrderPayment['provider']>('Cash');
  const [editAmount, setEditAmount] = useState('');
  const [updatingPayment, setUpdatingPayment] = useState(false);

  const [showPayEcoCash, setShowPayEcoCash] = useState(false);
  const [ecocashPhoneNumber, setEcocashPhoneNumber] = useState('');
  const [payingEcoCash, setPayingEcoCash] = useState(false);
  const [ecocashError, setEcocashError] = useState<string | null>(null);

  const [showAssignDriver, setShowAssignDriver] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [assigningDriver, setAssigningDriver] = useState(false);
  const [driverError, setDriverError] = useState<string | null>(null);
  const [updatingDeliveryStatus, setUpdatingDeliveryStatus] = useState(false);
  const [deliveryActionError, setDeliveryActionError] = useState<string | null>(null);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const performFulfill = useCallback(async () => {
    if (!order) return;
    setActionError(null);
    setFulfilling(true);
    try {
      await apiClient.markOrderFulfilled(order.id);
      showToast('Order marked as fulfilled.', 'success');
      load();
    } catch (err) {
      const message = (err as Error).message;
      setActionError(message);
      showToast(message, 'error');
    } finally {
      setFulfilling(false);
    }
  }, [order, load, showToast]);

  const confirmFulfill = useCallback(async () => {
    const ok = await confirm({
      title: 'Mark as fulfilled?',
      message: 'This confirms the order has been delivered to the customer.',
    });
    if (ok) performFulfill();
  }, [confirm, performFulfill]);

  const performSendInvoice = useCallback(async () => {
    if (!order) return;
    setActionError(null);
    setInvoicing(true);
    try {
      await apiClient.createInvoice(order.customerId);
      showToast('Invoice sent.', 'success');
      load();
    } catch (err) {
      const message = (err as Error).message;
      setActionError(message);
      showToast(message, 'error');
    } finally {
      setInvoicing(false);
    }
  }, [order, load, showToast]);

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
      showToast('Payment recorded.', 'success');
      setShowRecordPayment(false);
      load();
    } catch (err) {
      const message = (err as Error).message;
      setPaymentError(message);
      showToast(message, 'error');
    } finally {
      setRecordingPayment(false);
    }
  }, [order, paymentProvider, paymentReference, paymentAmount, load, showToast]);

  const startPayEcoCash = useCallback(() => {
    if (!order) return;
    setEcocashError(null);
    setEcocashPhoneNumber(order.customerWhatsAppNumber ?? '');
    setShowPayEcoCash(true);
  }, [order]);

  const submitPayEcoCash = useCallback(async () => {
    if (!order) return;
    if (!ecocashPhoneNumber.trim()) {
      setEcocashError('A phone number is required.');
      return;
    }
    setEcocashError(null);
    setPayingEcoCash(true);
    try {
      await apiClient.payOrderWithEcoCash(order.id, ecocashPhoneNumber.trim());
      showToast('EcoCash charge initiated.', 'success');
      setShowPayEcoCash(false);
      load();
    } catch (err) {
      const message = (err as Error).message;
      setEcocashError(message);
      showToast(message, 'error');
    } finally {
      setPayingEcoCash(false);
    }
  }, [order, ecocashPhoneNumber, load, showToast]);

  const startAssignDriver = useCallback(() => {
    if (!order) return;
    setDriverError(null);
    setDriverName(order.delivery?.driverName ?? '');
    setShowAssignDriver(true);
  }, [order]);

  const submitAssignDriver = useCallback(async () => {
    if (!order) return;
    setDriverError(null);
    setAssigningDriver(true);
    try {
      await apiClient.assignDeliveryDriver(order.id, driverName.trim() || undefined);
      showToast('Driver assigned.', 'success');
      setShowAssignDriver(false);
      load();
    } catch (err) {
      const message = (err as Error).message;
      setDriverError(message);
      showToast(message, 'error');
    } finally {
      setAssigningDriver(false);
    }
  }, [order, driverName, load, showToast]);

  const advanceDeliveryStatus = useCallback(
    async (status: DeliveryInfo['status']) => {
      if (!order) return;
      setDeliveryActionError(null);
      setUpdatingDeliveryStatus(true);
      try {
        await apiClient.updateDeliveryStatus(order.id, status);
        showToast(status === 'Delivered' ? 'Marked as delivered.' : 'Delivery status updated.', 'success');
        load();
      } catch (err) {
        const message = (err as Error).message;
        setDeliveryActionError(message);
        showToast(message, 'error');
      } finally {
        setUpdatingDeliveryStatus(false);
      }
    },
    [order, load, showToast]
  );

  const startEditPayment = useCallback(() => {
    if (!order?.payment) return;
    setEditProvider(order.payment.provider);
    setEditAmount(order.payment.amount.toFixed(2));
    setShowEditPayment(true);
    setActionError(null);
  }, [order]);

  const submitEditPayment = useCallback(async () => {
    if (!order) return;
    const parsedAmount = Number(editAmount);
    if (!editAmount.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setActionError('Enter a valid amount greater than zero.');
      return;
    }
    setActionError(null);
    setUpdatingPayment(true);
    try {
      await apiClient.updateOrderPayment(order.id, editProvider, parsedAmount);
      showToast('Payment updated.', 'success');
      setShowEditPayment(false);
      load();
    } catch (err) {
      const message = (err as Error).message;
      setActionError(message);
      showToast(message, 'error');
    } finally {
      setUpdatingPayment(false);
    }
  }, [order, editProvider, editAmount, load, showToast]);

  const locked = order?.status === 'Fulfilled' || order?.status === 'Cancelled';
  const hasConfirmedPayment = order?.payment?.status === 'Confirmed';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: order ? `Order #${order.id.slice(0, 8)}` : 'Order' }} />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && order === null && <ActivityIndicator style={styles.loading} />}
      {!error && order !== null && (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow} lightColor="transparent" darkColor="transparent">
            <Badge label={order.status} color={ORDER_STATUS_COLORS[order.status]} />
            <Text style={[styles.updatedAt, metaStyle]}>Updated {new Date(order.updatedAt).toLocaleString()}</Text>
          </View>

          <View style={styles.totalBlock} lightColor="transparent" darkColor="transparent">
            <Text style={styles.total}>{formatMoney(order.totalAmount, order.currency)}</Text>
            {order.vatAmount > 0 && (
              <Text style={[styles.vatNote, metaStyle]}>
                incl. VAT {formatMoney(order.vatAmount, order.currency)}
                {order.invoiceNumber !== null ? `  ·  Invoice #${order.invoiceNumber}` : ''}
              </Text>
            )}
          </View>

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
                <Badge label={order.payment.status} color={PAYMENT_STATUS_COLORS[order.payment.status] ?? semanticColors.neutral} />
              </View>
              <Text style={[styles.rowSecondary, metaStyle]}>Amount: {formatMoney(order.payment.amount, order.currency)}</Text>
              <Text style={[styles.rowSecondary, metaStyle]}>Ref: {order.payment.providerReference}</Text>
              {order.payment.confirmedAt && (
                <Text style={[styles.rowSecondary, metaStyle]}>Confirmed {new Date(order.payment.confirmedAt).toLocaleString()}</Text>
              )}

              {hasConfirmedPayment && !locked && !showEditPayment && (
                <Pressable style={styles.inlineEditButton} onPress={startEditPayment} disabled={!isOnline}>
                  <Text style={[styles.inlineEditButtonText, !isOnline && styles.buttonDisabled]}>Edit payment</Text>
                </Pressable>
              )}

              {showEditPayment && (
                <View style={styles.inlineForm} lightColor="transparent" darkColor="transparent">
                  <ProviderChips value={editProvider} onChange={setEditProvider} />
                  <Text style={[styles.rowSecondary, metaStyle]}>Amount ({order.currency})</Text>
                  <TextInput
                    style={[styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight]}
                    placeholder={order.payment.amount.toFixed(2)}
                    value={editAmount}
                    onChangeText={setEditAmount}
                    keyboardType="decimal-pad"
                  />
                  <View style={styles.inlineFormActions} lightColor="transparent" darkColor="transparent">
                    <Button label="Cancel" variant="secondary" style={styles.inlineFormButton} onPress={() => setShowEditPayment(false)} disabled={updatingPayment} />
                    <Button
                      label={updatingPayment ? 'Saving…' : 'Save'}
                      style={styles.inlineFormButton}
                      disabled={updatingPayment || !isOnline}
                      onPress={submitEditPayment}
                    />
                  </View>
                </View>
              )}
            </Section>
          )}

          {!hasConfirmedPayment && !locked && (
            <Section title="Payment">
              {!order.payment && <Text style={[styles.rowSecondary, metaStyle]}>No payment recorded yet.</Text>}
              {!showRecordPayment && (
                <Pressable style={styles.inlineEditButton} onPress={startRecordPayment} disabled={!isOnline}>
                  <Text style={[styles.inlineEditButtonText, !isOnline && styles.buttonDisabled]}>Record payment</Text>
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
                    <Button label="Cancel" variant="secondary" style={styles.inlineFormButton} onPress={() => setShowRecordPayment(false)} disabled={recordingPayment} />
                    <Button
                      label={recordingPayment ? 'Recording…' : 'Confirm payment'}
                      style={styles.inlineFormButton}
                      disabled={recordingPayment || !isOnline}
                      onPress={submitRecordPayment}
                    />
                  </View>
                </View>
              )}

              {order.status === 'Invoiced' && !showPayEcoCash && (
                <Pressable style={styles.inlineEditButton} onPress={startPayEcoCash} disabled={!isOnline}>
                  <Text style={[styles.inlineEditButtonText, !isOnline && styles.buttonDisabled]}>Pay with EcoCash</Text>
                </Pressable>
              )}
              {showPayEcoCash && (
                <View style={styles.inlineForm} lightColor="transparent" darkColor="transparent">
                  <Text style={[styles.rowSecondary, metaStyle]}>EcoCash phone number</Text>
                  <TextInput
                    style={[styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight]}
                    placeholder="e.g. 0771234567"
                    value={ecocashPhoneNumber}
                    onChangeText={setEcocashPhoneNumber}
                    keyboardType="phone-pad"
                  />
                  {ecocashError && <Text style={styles.error}>{ecocashError}</Text>}
                  <View style={styles.inlineFormActions} lightColor="transparent" darkColor="transparent">
                    <Button label="Cancel" variant="secondary" style={styles.inlineFormButton} onPress={() => setShowPayEcoCash(false)} disabled={payingEcoCash} />
                    <Button
                      label={payingEcoCash ? 'Charging…' : 'Charge'}
                      style={styles.inlineFormButton}
                      disabled={payingEcoCash || !isOnline}
                      onPress={submitPayEcoCash}
                    />
                  </View>
                </View>
              )}
            </Section>
          )}

          {(order.status === 'Paid' || order.status === 'Fulfilled') && (
            <Section title="Delivery">
              <View style={styles.headerRow} lightColor="transparent" darkColor="transparent">
                <Text style={styles.rowPrimary}>{order.delivery?.driverName ?? 'No driver assigned'}</Text>
                <Badge label={order.delivery?.status ?? 'Pending'} color={DELIVERY_STATUS_COLORS[order.delivery?.status ?? 'Pending']} />
              </View>

              {!showAssignDriver && (
                <Pressable style={styles.inlineEditButton} onPress={startAssignDriver} disabled={!isOnline}>
                  <Text style={[styles.inlineEditButtonText, !isOnline && styles.buttonDisabled]}>
                    {order.delivery?.driverName ? 'Reassign driver' : 'Assign driver'}
                  </Text>
                </Pressable>
              )}
              {showAssignDriver && (
                <View style={styles.inlineForm} lightColor="transparent" darkColor="transparent">
                  <TextInput
                    style={[styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight]}
                    placeholder="Driver name"
                    value={driverName}
                    onChangeText={setDriverName}
                  />
                  {driverError && <Text style={styles.error}>{driverError}</Text>}
                  <View style={styles.inlineFormActions} lightColor="transparent" darkColor="transparent">
                    <Button label="Cancel" variant="secondary" style={styles.inlineFormButton} onPress={() => setShowAssignDriver(false)} disabled={assigningDriver} />
                    <Button
                      label={assigningDriver ? 'Saving…' : 'Save'}
                      style={styles.inlineFormButton}
                      disabled={assigningDriver || !isOnline}
                      onPress={submitAssignDriver}
                    />
                  </View>
                </View>
              )}

              {deliveryActionError && <Text style={styles.error}>{deliveryActionError}</Text>}

              {(order.delivery?.status ?? 'Pending') === 'Assigned' && (
                <Pressable
                  style={styles.inlineEditButton}
                  onPress={() => advanceDeliveryStatus('InTransit')}
                  disabled={updatingDeliveryStatus || !isOnline}
                >
                  <Text style={[styles.inlineEditButtonText, (updatingDeliveryStatus || !isOnline) && styles.buttonDisabled]}>Mark in transit</Text>
                </Pressable>
              )}
              {order.delivery?.status !== 'Delivered' && (
                <Pressable
                  style={styles.inlineEditButton}
                  onPress={() => advanceDeliveryStatus('Delivered')}
                  disabled={updatingDeliveryStatus || !isOnline}
                >
                  <Text style={[styles.inlineEditButtonText, (updatingDeliveryStatus || !isOnline) && styles.buttonDisabled]}>Mark delivered</Text>
                </Pressable>
              )}
            </Section>
          )}

          <Text style={[styles.createdAt, metaStyle]}>Order placed {new Date(order.createdAt).toLocaleString()}</Text>

          {actionError && <Text style={styles.error}>{actionError}</Text>}

          {order.payment && (
            <Button
              label={downloadingReceipt ? 'Preparing…' : 'Download receipt'}
              variant="secondary"
              style={styles.secondaryButtonSpacing}
              disabled={downloadingReceipt}
              onPress={downloadReceipt}
            />
          )}

          {order.status === 'Quoted' && (
            <Button
              label={invoicing ? 'Sending invoice…' : 'Send invoice'}
              style={styles.secondaryButtonSpacing}
              disabled={invoicing || !isOnline}
              onPress={performSendInvoice}
            />
          )}
          {!isOnline && <Text style={styles.offlineNotice}>You're offline — some actions are disabled.</Text>}

          <Button
            label="Ask Assistant about this"
            variant="secondary"
            style={styles.secondaryButtonSpacing}
            onPress={() =>
              router.push({ pathname: '/(tabs)/assistant', params: { attachUri: `business://orders/${order.id}`, attachLabel: `Order #${order.id.slice(0, 8)}` } })
            }
          />

          {order.status === 'Paid' && (
            <Button
              label={fulfilling ? 'Marking fulfilled…' : 'Mark as fulfilled'}
              disabled={fulfilling || !isOnline}
              onPress={confirmFulfill}
            />
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  loading: { marginTop: 40 },
  error: { color: semanticColors.danger, marginBottom: 12 },
  cacheNote: { opacity: 0.6, fontSize: 12, marginBottom: 12 },
  offlineNotice: { color: semanticColors.danger, fontSize: 12, marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  updatedAt: { fontSize: 12 },
  totalBlock: { marginBottom: 20 },
  total: { fontSize: 30, fontWeight: '700' },
  vatNote: { fontSize: 12, marginTop: 2 },
  rowPrimary: { ...typography.bodyStrong },
  rowSecondary: { fontSize: 13, marginTop: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm + 2 },
  itemNameCol: { flexShrink: 1, paddingRight: spacing.md },
  itemSubtotal: { fontSize: 14, fontWeight: '600' },
  createdAt: { fontSize: 12, marginBottom: 8 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  secondaryButtonSpacing: { marginBottom: spacing.md },
  buttonDisabled: { opacity: 0.6 },
  inlineEditButton: { marginTop: 10 },
  inlineEditButtonText: { color: '#007aff', fontWeight: '600', fontSize: 13 },
  inlineForm: { marginTop: 10, gap: 8 },
  inlineFormActions: { flexDirection: 'row', gap: spacing.md, marginTop: 4 },
  inlineFormButton: { flex: 1, paddingVertical: 10 },
  providerRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
});
