import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { apiClient, MarketplaceOrderDetail, OrderStatus } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Section } from '@/components/ui/Section';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { semanticColors } from '@/constants/theme';
import { colorFor, initialsFor } from '@/src/marketplace/avatar';
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

const DELIVERY_STATUS_COLORS: Record<string, string> = {
  Pending: semanticColors.neutral,
  Assigned: semanticColors.warning,
  InTransit: '#2f80ed',
  Delivered: semanticColors.success,
};

const STATUS_ICONS: Record<OrderStatus, SFSymbol> = {
  Quoted: 'doc.text',
  Invoiced: 'clock',
  Paid: 'checkmark.circle',
  Fulfilled: 'checkmark.seal',
  Cancelled: 'xmark.circle',
};

const PROGRESS_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'Quoted', label: 'Quoted' },
  { status: 'Invoiced', label: 'Invoiced' },
  { status: 'Paid', label: 'Paid' },
  { status: 'Fulfilled', label: 'Fulfilled' },
];

function BusinessAvatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <View style={[styles.avatar, { backgroundColor: colorFor(name), width: size, height: size, borderRadius: size / 2 }]} lightColor="transparent" darkColor="transparent">
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initialsFor(name)}</Text>
    </View>
  );
}

function OrderProgress({ status, tint, isDark }: { status: OrderStatus; tint: string; isDark: boolean }) {
  if (status === 'Cancelled') return null;
  const currentIndex = PROGRESS_STEPS.findIndex((s) => s.status === status);
  const trackColor = isDark ? 'rgba(255,255,255,0.12)' : '#e5e5ea';

  return (
    <View style={styles.progressRow} lightColor="transparent" darkColor="transparent">
      {PROGRESS_STEPS.map((step, i) => {
        const reached = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <Fragment key={step.status}>
            <View style={styles.progressStep} lightColor="transparent" darkColor="transparent">
              <View style={[styles.progressDot, { backgroundColor: reached ? tint : trackColor }, isCurrent && styles.progressDotCurrent]}>
                {reached && <Icon name="checkmark" size={11} color="#fff" />}
              </View>
              <Text style={[styles.progressLabel, reached ? { color: tint, fontWeight: '700' } : styles.progressLabelMuted]}>{step.label}</Text>
            </View>
            {i < PROGRESS_STEPS.length - 1 && (
              <View style={[styles.progressLine, { backgroundColor: i < currentIndex ? tint : trackColor }]} />
            )}
          </Fragment>
        );
      })}
    </View>
  );
}

export default function MyOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const tint = Colors[colorScheme].tint;
  const isOnline = useIsOnline();
  const metaStyle = isDark ? styles.metaDark : styles.metaLight;
  const inputStyle = [styles.input, isDark ? styles.inputDark : styles.inputLight];
  const { confirm } = useConfirm();
  const { show: showToast } = useToast();

  const fetchOrder = useCallback(() => apiClient.getMyMarketplaceOrder(id!), [id]);
  const { data: order, error, isFromCache, reload: load } = useCachedFetch<MarketplaceOrderDetail>(`customer-order:${id}`, fetchOrder);

  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [showRequestCancellation, setShowRequestCancellation] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [requestingCancellation, setRequestingCancellation] = useState(false);

  const [showPayEcoCash, setShowPayEcoCash] = useState(false);
  const [ecocashPhoneNumber, setEcocashPhoneNumber] = useState('');
  const [payingEcoCash, setPayingEcoCash] = useState(false);
  const [ecocashResult, setEcocashResult] = useState<{ instructions: string | null } | null>(null);

  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofSubmitted, setProofSubmitted] = useState(false);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const performCancel = useCallback(async () => {
    if (!order) return;
    setActionError(null);
    setCancelling(true);
    try {
      await apiClient.cancelMyOrder(order.orderId);
      showToast('Order cancelled.', 'success');
      load();
    } catch (err) {
      const message = (err as Error).message;
      setActionError(message);
      showToast(message, 'error');
    } finally {
      setCancelling(false);
    }
  }, [order, load, showToast]);

  const confirmCancel = useCallback(async () => {
    const ok = await confirm({
      title: 'Cancel this order?',
      message: "This can't be undone — you'll need to place a new order if you change your mind.",
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      destructive: true,
    });
    if (ok) performCancel();
  }, [confirm, performCancel]);

  const submitRequestCancellation = useCallback(async () => {
    if (!order) return;
    setActionError(null);
    setRequestingCancellation(true);
    try {
      await apiClient.requestMyOrderCancellation(order.orderId, cancellationReason.trim() || undefined);
      showToast('Cancellation request sent.', 'success');
      setShowRequestCancellation(false);
      load();
    } catch (err) {
      const message = (err as Error).message;
      setActionError(message);
      showToast(message, 'error');
    } finally {
      setRequestingCancellation(false);
    }
  }, [order, cancellationReason, load, showToast]);

  const submitPayEcoCash = useCallback(async () => {
    if (!order) return;
    if (!ecocashPhoneNumber.trim()) {
      setActionError('An EcoCash phone number is required.');
      return;
    }
    setActionError(null);
    setPayingEcoCash(true);
    try {
      const result = await apiClient.payWithEcoCash(order.orderId, ecocashPhoneNumber.trim());
      setEcocashResult({ instructions: result.instructions });
      showToast('EcoCash payment initiated.', 'success');
      setShowPayEcoCash(false);
      load();
    } catch (err) {
      const message = (err as Error).message;
      setActionError(message);
      showToast(message, 'error');
    } finally {
      setPayingEcoCash(false);
    }
  }, [order, ecocashPhoneNumber, load, showToast]);

  const pickAndUploadProof = useCallback(async () => {
    if (!order) return;
    setActionError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setActionError('Permission was not granted.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploadingProof(true);
    try {
      await apiClient.submitPaymentProof(order.orderId, asset.uri, asset.mimeType ?? 'image/jpeg');
      setProofSubmitted(true);
      showToast('Payment proof submitted.', 'success');
      load();
    } catch (err) {
      const message = (err as Error).message;
      setActionError(message);
      showToast(message, 'error');
    } finally {
      setUploadingProof(false);
    }
  }, [order, load, showToast]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: order ? `Order #${order.orderId.slice(0, 8)}` : 'Order' }} />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && order === null && <ActivityIndicator style={styles.loading} />}
      {!error && order !== null && (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Card style={styles.heroCard}>
            <View style={styles.heroTopRow} lightColor="transparent" darkColor="transparent">
              <View style={styles.businessRow} lightColor="transparent" darkColor="transparent">
                <BusinessAvatar name={order.businessName} />
                <View lightColor="transparent" darkColor="transparent">
                  <Text style={styles.businessName} numberOfLines={1}>
                    {order.businessName}
                  </Text>
                  <Text style={[styles.updatedAt, metaStyle]}>Updated {new Date(order.updatedAt).toLocaleDateString()}</Text>
                </View>
              </View>
              <Badge label={order.status} color={ORDER_STATUS_COLORS[order.status]} icon={STATUS_ICONS[order.status]} />
            </View>

            <View style={styles.totalBlock} lightColor="transparent" darkColor="transparent">
              <Text style={[styles.total, { color: tint }]}>{formatMoney(order.totalAmount, order.currency)}</Text>
              {order.vatAmount > 0 && (
                <Text style={[styles.vatNote, metaStyle]}>
                  incl. VAT {formatMoney(order.vatAmount, order.currency)}
                  {order.invoiceNumber !== null ? `  ·  Invoice #${order.invoiceNumber}` : ''}
                </Text>
              )}
            </View>

            <OrderProgress status={order.status} tint={tint} isDark={isDark} />
          </Card>

          <Section title={`Items (${order.items.length})`}>
            {order.items.map((item, index) => (
              <View
                key={item.catalogItemId}
                style={[styles.itemRow, index === order.items.length - 1 && styles.itemRowLast]}
                lightColor="transparent"
                darkColor="transparent"
              >
                <View style={styles.itemThumbPlaceholder} lightColor="#f2f2f7" darkColor="rgba(255,255,255,0.08)">
                  <Icon name="cube.box" size={16} color={semanticColors.neutral} />
                </View>
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
            <Section title="Payment" accentColor={PAYMENT_STATUS_COLORS[order.payment.status] ?? semanticColors.neutral}>
              <View style={styles.headerRow} lightColor="transparent" darkColor="transparent">
                <Text style={styles.rowPrimary}>{order.payment.provider}</Text>
                <Badge label={order.payment.status} color={PAYMENT_STATUS_COLORS[order.payment.status] ?? semanticColors.neutral} />
              </View>
              <Text style={[styles.rowSecondary, metaStyle]}>Ref: {order.payment.providerReference}</Text>
              {order.payment.confirmedAt && (
                <Text style={[styles.rowSecondary, metaStyle]}>Confirmed {new Date(order.payment.confirmedAt).toLocaleString()}</Text>
              )}
            </Section>
          )}

          {order.delivery && (
            <Section title="Delivery" accentColor={DELIVERY_STATUS_COLORS[order.delivery.status] ?? semanticColors.neutral}>
              <View style={styles.headerRow} lightColor="transparent" darkColor="transparent">
                <Text style={styles.rowPrimary}>{order.delivery.driverName ?? 'Driver not yet assigned'}</Text>
                <Badge label={order.delivery.status} color={DELIVERY_STATUS_COLORS[order.delivery.status] ?? semanticColors.neutral} />
              </View>
            </Section>
          )}

          {order.canCancelDirectly && (
            <Section title="Pay for this order">
              {ecocashResult?.instructions && (
                <View style={styles.noticeBox} lightColor="rgba(46,125,50,0.08)" darkColor="rgba(46,125,50,0.15)">
                  <Icon name="checkmark.circle" size={14} color={semanticColors.success} />
                  <Text style={[styles.rowSecondary, { flex: 1, marginTop: 0 }]}>{ecocashResult.instructions}</Text>
                </View>
              )}
              {proofSubmitted && (
                <View style={styles.noticeBox} lightColor="rgba(242,153,74,0.1)" darkColor="rgba(242,153,74,0.15)">
                  <Icon name="clock" size={14} color={semanticColors.warning} />
                  <Text style={[styles.rowSecondary, { flex: 1, marginTop: 0 }]}>Your proof was submitted — the business will review it shortly.</Text>
                </View>
              )}

              <View style={styles.payActions} lightColor="transparent" darkColor="transparent">
                {order.isPaynowConnected && !showPayEcoCash && (
                  <Button label="Pay with EcoCash" variant="secondary" onPress={() => setShowPayEcoCash(true)} disabled={!isOnline} />
                )}

                <Button
                  label={uploadingProof ? 'Uploading…' : 'Upload payment proof'}
                  variant="secondary"
                  onPress={pickAndUploadProof}
                  disabled={uploadingProof || !isOnline}
                />
              </View>

              {showPayEcoCash && (
                <View style={styles.inlineForm} lightColor="transparent" darkColor="transparent">
                  <TextInput
                    style={inputStyle}
                    placeholder="EcoCash phone number"
                    placeholderTextColor="#8e8e93"
                    value={ecocashPhoneNumber}
                    onChangeText={setEcocashPhoneNumber}
                    keyboardType="phone-pad"
                  />
                  <View style={styles.inlineFormActions} lightColor="transparent" darkColor="transparent">
                    <Button label="Cancel" variant="secondary" onPress={() => setShowPayEcoCash(false)} disabled={payingEcoCash} style={styles.inlineFormButton} />
                    <Button
                      label={payingEcoCash ? 'Paying…' : 'Pay'}
                      onPress={submitPayEcoCash}
                      disabled={payingEcoCash || !isOnline}
                      style={styles.inlineFormButton}
                    />
                  </View>
                </View>
              )}
            </Section>
          )}

          {actionError && (
            <View style={styles.noticeBox} lightColor="rgba(192,57,43,0.08)" darkColor="rgba(192,57,43,0.15)">
              <Icon name="exclamationmark.triangle" size={14} color={semanticColors.danger} />
              <Text style={[styles.error, { flex: 1, marginTop: 0, marginBottom: 0 }]}>{actionError}</Text>
            </View>
          )}
          {!isOnline && (
            <View style={styles.noticeBox} lightColor="rgba(192,57,43,0.08)" darkColor="rgba(192,57,43,0.15)">
              <Icon name="wifi.slash" size={14} color={semanticColors.danger} />
              <Text style={[styles.offlineNotice, { flex: 1, marginBottom: 0 }]}>You're offline — some actions are disabled.</Text>
            </View>
          )}

          {order.canCancelDirectly && (
            <Button
              label={cancelling ? 'Cancelling…' : 'Cancel order'}
              variant="destructive"
              disabled={cancelling || !isOnline}
              onPress={confirmCancel}
              style={styles.destructiveButton}
            />
          )}

          {order.canRequestCancellation && !showRequestCancellation && (
            <Button
              label="Request cancellation"
              variant="destructive"
              disabled={!isOnline}
              onPress={() => setShowRequestCancellation(true)}
              style={styles.destructiveButton}
            />
          )}
          {order.canRequestCancellation && showRequestCancellation && (
            <View style={styles.inlineForm} lightColor="transparent" darkColor="transparent">
              <TextInput
                style={inputStyle}
                placeholder="Reason (optional)"
                placeholderTextColor="#8e8e93"
                value={cancellationReason}
                onChangeText={setCancellationReason}
              />
              <View style={styles.inlineFormActions} lightColor="transparent" darkColor="transparent">
                <Button label="Cancel" variant="secondary" onPress={() => setShowRequestCancellation(false)} disabled={requestingCancellation} style={styles.inlineFormButton} />
                <Button
                  label={requestingCancellation ? 'Sending…' : 'Send request'}
                  onPress={submitRequestCancellation}
                  disabled={requestingCancellation || !isOnline}
                  style={styles.inlineFormButton}
                />
              </View>
            </View>
          )}

          <Text style={[styles.createdAt, metaStyle]}>Order placed {new Date(order.createdAt).toLocaleString()}</Text>
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
  cacheNote: { opacity: 0.6, fontSize: 12, marginBottom: 12, marginHorizontal: 16 },
  offlineNotice: { color: semanticColors.danger, fontSize: 12 },
  heroCard: { marginBottom: 16 },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  businessRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, marginRight: 8 },
  businessName: { fontSize: 15, fontWeight: '700' },
  updatedAt: { fontSize: 12, marginTop: 1 },
  totalBlock: { marginBottom: 18 },
  total: { fontSize: 34, fontWeight: '800' },
  vatNote: { fontSize: 12, marginTop: 4 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  progressRow: { flexDirection: 'row', alignItems: 'flex-start' },
  progressStep: { alignItems: 'center', width: 62 },
  progressDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  progressDotCurrent: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 2 },
  progressLabel: { fontSize: 10, marginTop: 5, textAlign: 'center' },
  progressLabelMuted: { fontSize: 10, opacity: 0.4 },
  progressLine: { flex: 1, height: 2, marginTop: 13, marginHorizontal: -8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  rowPrimary: { fontSize: 15, fontWeight: '600' },
  rowSecondary: { fontSize: 13, marginTop: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  itemRowLast: { marginBottom: 0 },
  itemThumbPlaceholder: { width: 38, height: 38, borderRadius: 9, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  itemNameCol: { flex: 1, flexShrink: 1, paddingRight: 12 },
  itemSubtotal: { fontSize: 14, fontWeight: '700' },
  createdAt: { fontSize: 12, marginTop: 4, textAlign: 'center' },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  noticeBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: 10, marginBottom: 10 },
  payActions: { gap: 10 },
  destructiveButton: { marginBottom: 10 },
  inlineForm: { marginTop: 12, gap: 10 },
  inlineFormActions: { flexDirection: 'row', gap: 12, marginTop: 2 },
  inlineFormButton: { flex: 1 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
});
