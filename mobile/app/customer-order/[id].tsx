import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput } from 'react-native';

import { apiClient, MarketplaceOrderDetail } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { formatMoney, ORDER_STATUS_COLORS } from '@/src/orders/orderStatus';
import { useCachedFetch } from '@/src/offline/useCachedFetch';
import { useIsOnline } from '@/src/offline/networkStatus';

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  Pending: '#f2994a',
  Confirmed: '#2e7d32',
  Failed: '#c0392b',
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

export default function MyOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const isOnline = useIsOnline();
  const metaStyle = colorScheme === 'dark' ? styles.metaDark : styles.metaLight;
  const inputStyle = [styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight];

  const fetchOrder = useCallback(() => apiClient.getMyMarketplaceOrder(id!), [id]);
  const { data: order, error, isFromCache, reload: load } = useCachedFetch<MarketplaceOrderDetail>(`customer-order:${id}`, fetchOrder);

  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancelVisible, setConfirmCancelVisible] = useState(false);

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
    setConfirmCancelVisible(false);
    setActionError(null);
    setCancelling(true);
    try {
      await apiClient.cancelMyOrder(order.orderId);
      load();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setCancelling(false);
    }
  }, [order, load]);

  const submitRequestCancellation = useCallback(async () => {
    if (!order) return;
    setActionError(null);
    setRequestingCancellation(true);
    try {
      await apiClient.requestMyOrderCancellation(order.orderId, cancellationReason.trim() || undefined);
      setShowRequestCancellation(false);
      load();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setRequestingCancellation(false);
    }
  }, [order, cancellationReason, load]);

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
      setShowPayEcoCash(false);
      load();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setPayingEcoCash(false);
    }
  }, [order, ecocashPhoneNumber, load]);

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
      load();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setUploadingProof(false);
    }
  }, [order, load]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: order ? `Order #${order.orderId.slice(0, 8)}` : 'Order' }} />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && order === null && <ActivityIndicator style={styles.loading} />}
      {!error && order !== null && (
        <>
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
            <Text style={[styles.rowSecondary, metaStyle]}>{order.businessName}</Text>
          </View>

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
            </Section>
          )}

          {order.canCancelDirectly && (
            <Section title="Pay for this order">
              {ecocashResult?.instructions && <Text style={[styles.rowSecondary, metaStyle]}>{ecocashResult.instructions}</Text>}
              {proofSubmitted && <Text style={[styles.rowSecondary, metaStyle]}>Your proof was submitted — the business will review it shortly.</Text>}

              {order.isPaynowConnected && !showPayEcoCash && (
                <Pressable style={styles.inlineEditButton} onPress={() => setShowPayEcoCash(true)} disabled={!isOnline}>
                  <Text style={[styles.inlineEditButtonText, !isOnline && styles.buttonDisabled]}>Pay with EcoCash</Text>
                </Pressable>
              )}
              {showPayEcoCash && (
                <View style={styles.inlineForm} lightColor="transparent" darkColor="transparent">
                  <TextInput
                    style={inputStyle}
                    placeholder="EcoCash phone number"
                    value={ecocashPhoneNumber}
                    onChangeText={setEcocashPhoneNumber}
                    keyboardType="phone-pad"
                  />
                  <View style={styles.inlineFormActions} lightColor="transparent" darkColor="transparent">
                    <Pressable style={styles.modalCancelButtonWide} onPress={() => setShowPayEcoCash(false)} disabled={payingEcoCash}>
                      <Text style={styles.modalCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.button, styles.inlineFormConfirmButton, (payingEcoCash || !isOnline) && styles.buttonDisabled]}
                      disabled={payingEcoCash || !isOnline}
                      onPress={submitPayEcoCash}
                    >
                      <Text style={styles.buttonText}>{payingEcoCash ? 'Paying…' : 'Pay'}</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              <Pressable
                style={[styles.inlineEditButton, uploadingProof && styles.buttonDisabled]}
                onPress={pickAndUploadProof}
                disabled={uploadingProof || !isOnline}
              >
                <Text style={styles.inlineEditButtonText}>{uploadingProof ? 'Uploading…' : 'Upload payment proof'}</Text>
              </Pressable>
            </Section>
          )}

          {actionError && <Text style={styles.error}>{actionError}</Text>}
          {!isOnline && <Text style={styles.offlineNotice}>You're offline — some actions are disabled.</Text>}

          {order.canCancelDirectly && (
            <Pressable
              style={[styles.secondaryButton, (cancelling || !isOnline) && styles.buttonDisabled]}
              disabled={cancelling || !isOnline}
              onPress={() => setConfirmCancelVisible(true)}
            >
              <Text style={styles.secondaryButtonText}>{cancelling ? 'Cancelling…' : 'Cancel order'}</Text>
            </Pressable>
          )}

          {order.canRequestCancellation && !showRequestCancellation && (
            <Pressable
              style={[styles.secondaryButton, !isOnline && styles.buttonDisabled]}
              disabled={!isOnline}
              onPress={() => setShowRequestCancellation(true)}
            >
              <Text style={styles.secondaryButtonText}>Request cancellation</Text>
            </Pressable>
          )}
          {order.canRequestCancellation && showRequestCancellation && (
            <View style={styles.inlineForm} lightColor="transparent" darkColor="transparent">
              <TextInput
                style={inputStyle}
                placeholder="Reason (optional)"
                value={cancellationReason}
                onChangeText={setCancellationReason}
              />
              <View style={styles.inlineFormActions} lightColor="transparent" darkColor="transparent">
                <Pressable style={styles.modalCancelButtonWide} onPress={() => setShowRequestCancellation(false)} disabled={requestingCancellation}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.button, styles.inlineFormConfirmButton, (requestingCancellation || !isOnline) && styles.buttonDisabled]}
                  disabled={requestingCancellation || !isOnline}
                  onPress={submitRequestCancellation}
                >
                  <Text style={styles.buttonText}>{requestingCancellation ? 'Sending…' : 'Send request'}</Text>
                </Pressable>
              </View>
            </View>
          )}

          <Text style={[styles.createdAt, metaStyle]}>Order placed {new Date(order.createdAt).toLocaleString()}</Text>
        </>
      )}

      <Modal visible={confirmCancelVisible} transparent animationType="fade" onRequestClose={() => setConfirmCancelVisible(false)}>
        <View style={styles.modalOverlay} lightColor="rgba(0,0,0,0.4)" darkColor="rgba(0,0,0,0.6)">
          <View style={styles.modalCard} lightColor="#fff" darkColor="#1c1c1e">
            <Text style={styles.modalTitle}>Cancel this order?</Text>
            <Text style={[styles.modalBody, metaStyle]}>This can't be undone — you'll need to place a new order if you change your mind.</Text>
            <View style={styles.modalActions} lightColor="transparent" darkColor="transparent">
              <Pressable style={[styles.modalButton, styles.modalCancelButton]} onPress={() => setConfirmCancelVisible(false)}>
                <Text style={styles.modalCancelText}>Keep order</Text>
              </Pressable>
              <Pressable style={[styles.modalButton, styles.button]} onPress={performCancel}>
                <Text style={styles.buttonText}>Cancel order</Text>
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
  cacheNote: { opacity: 0.6, fontSize: 12, marginBottom: 12 },
  offlineNotice: { color: '#c0392b', fontSize: 12, marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  updatedAt: { fontSize: 12 },
  totalBlock: { marginBottom: 20 },
  total: { fontSize: 30, fontWeight: '700' },
  vatNote: { fontSize: 12, marginTop: 2 },
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
  secondaryButton: { borderWidth: 1, borderColor: '#c0392b', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  secondaryButtonText: { color: '#c0392b', fontWeight: '600' },
  inlineEditButton: { marginTop: 10 },
  inlineEditButtonText: { color: '#007aff', fontWeight: '600', fontSize: 13 },
  inlineForm: { marginTop: 10, gap: 8 },
  inlineFormActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  inlineFormConfirmButton: { flex: 1 },
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
