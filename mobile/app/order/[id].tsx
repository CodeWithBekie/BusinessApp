import { Stack, useLocalSearchParams } from 'expo-router';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet } from 'react-native';

import { apiClient, OrderDetail } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { formatMoney, ORDER_STATUS_COLORS } from '@/src/orders/orderStatus';

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

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fulfilling, setFulfilling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);

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

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: order ? `Order #${order.id.slice(0, 8)}` : 'Order' }} />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {!error && order === null && <ActivityIndicator style={styles.loading} />}
      {!error && order !== null && (
        <>
          <View style={styles.headerRow} lightColor="transparent" darkColor="transparent">
            <Badge label={order.status} color={ORDER_STATUS_COLORS[order.status]} />
            <Text style={[styles.updatedAt, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
              Updated {new Date(order.updatedAt).toLocaleString()}
            </Text>
          </View>

          <Text style={styles.total}>{formatMoney(order.totalAmount, order.currency)}</Text>

          <Section title="Customer">
            <Text style={styles.rowPrimary}>{order.customerName ?? 'No name on file'}</Text>
            <Text style={[styles.rowSecondary, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
              {order.customerWhatsAppNumber}
            </Text>
          </Section>

          <Section title={`Items (${order.items.length})`}>
            {order.items.map((item) => (
              <View key={item.catalogItemId} style={styles.itemRow} lightColor="transparent" darkColor="transparent">
                <View style={styles.itemNameCol} lightColor="transparent" darkColor="transparent">
                  <Text style={styles.rowPrimary} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.rowSecondary, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
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
              <Text style={[styles.rowSecondary, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
                Ref: {order.payment.providerReference}
              </Text>
              {order.payment.confirmedAt && (
                <Text style={[styles.rowSecondary, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
                  Confirmed {new Date(order.payment.confirmedAt).toLocaleString()}
                </Text>
              )}
            </Section>
          )}

          <Text style={[styles.createdAt, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
            Order placed {new Date(order.createdAt).toLocaleString()}
          </Text>

          {actionError && <Text style={styles.error}>{actionError}</Text>}

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
            <Text style={[styles.modalBody, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
              This confirms the order has been delivered to the customer.
            </Text>
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
  createdAt: { fontSize: 12, marginBottom: 20 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  button: { backgroundColor: '#007aff', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  modalBody: { fontSize: 14, marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalCancelButton: { borderWidth: 1, borderColor: '#ccc' },
  modalCancelText: { fontWeight: '600' },
});
