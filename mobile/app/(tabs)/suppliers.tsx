import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { apiClient, PurchaseOrderStatus, PurchaseOrderSummary, Supplier } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { formatMoney } from '@/src/common/format';
import { formatRelativeDate } from '@/src/orders/orderStatus';

type Section = 'suppliers' | 'purchaseOrders';
type PoFilterValue = PurchaseOrderStatus | 'All';

const PO_FILTERS: readonly PoFilterValue[] = ['All', 'Draft', 'Ordered', 'Received', 'Cancelled'];

const PO_STATUS_COLORS: Record<PurchaseOrderStatus, string> = {
  Draft: '#8e8e93',
  Ordered: '#f2994a',
  Received: '#2e7d32',
  Cancelled: '#c0392b',
};

function SectionTabs({ value, onChange }: { value: Section; onChange: (value: Section) => void }) {
  return (
    <View style={styles.sectionRow} lightColor="transparent" darkColor="transparent">
      <Pressable onPress={() => onChange('suppliers')} style={[styles.sectionChip, value === 'suppliers' && styles.sectionChipActive]}>
        <Text style={[styles.sectionChipText, value === 'suppliers' && styles.sectionChipTextActive]}>Suppliers</Text>
      </Pressable>
      <Pressable onPress={() => onChange('purchaseOrders')} style={[styles.sectionChip, value === 'purchaseOrders' && styles.sectionChipActive]}>
        <Text style={[styles.sectionChipText, value === 'purchaseOrders' && styles.sectionChipTextActive]}>Purchase Orders</Text>
      </Pressable>
    </View>
  );
}

function SupplierCard({ supplier, onPress }: { supplier: Supplier; onPress: () => void }) {
  const colorScheme = useColorScheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={[styles.cardInner, !supplier.active && styles.cardInactive]} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
        <Text style={styles.cardTitle} numberOfLines={1}>
          {supplier.name}
        </Text>
        <Text style={[styles.cardMeta, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
          {[supplier.contactPhone, supplier.email].filter(Boolean).join(' · ') || 'No contact details'}
          {!supplier.active ? ' · Inactive' : ''}
        </Text>
      </View>
    </Pressable>
  );
}

function PurchaseOrderCard({ po, onPress }: { po: PurchaseOrderSummary; onPress: () => void }) {
  const colorScheme = useColorScheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.cardInner} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
        <View style={styles.cardTopRow} lightColor="transparent" darkColor="transparent">
          <Text style={styles.cardTitle} numberOfLines={1}>
            {po.supplierName}
          </Text>
          <View style={[styles.badge, { backgroundColor: PO_STATUS_COLORS[po.status] }]}>
            <Text style={styles.badgeText}>{po.status}</Text>
          </View>
        </View>
        <View style={styles.cardBottomRow} lightColor="transparent" darkColor="transparent">
          <Text style={styles.total}>{formatMoney(po.totalAmount, po.currency)}</Text>
          <Text style={[styles.cardMeta, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
            {po.itemCount} item{po.itemCount === 1 ? '' : 's'} · {formatRelativeDate(po.createdAt)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function SuppliersScreen() {
  const router = useRouter();
  const [section, setSection] = useState<Section>('suppliers');

  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  const [poFilter, setPoFilter] = useState<PoFilterValue>('All');
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderSummary[] | null>(null);
  const [poError, setPoError] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  const loadSuppliers = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    apiClient
      .getSuppliers()
      .then((data) => {
        setSuppliers(data);
        setSupplierError(null);
      })
      .catch((err: Error) => setSupplierError(err.message))
      .finally(() => setRefreshing(false));
  }, []);

  const loadPurchaseOrders = useCallback((filter: PoFilterValue, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    apiClient
      .getPurchaseOrders(filter === 'All' ? undefined : filter)
      .then((data) => {
        setPurchaseOrders(data);
        setPoError(null);
      })
      .catch((err: Error) => setPoError(err.message))
      .finally(() => setRefreshing(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (section === 'suppliers') {
        loadSuppliers();
      } else {
        loadPurchaseOrders(poFilter);
      }
    }, [section, poFilter, loadSuppliers, loadPurchaseOrders])
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow} lightColor="transparent" darkColor="transparent">
        <Text style={styles.title}>Suppliers</Text>
        <Pressable
          style={styles.addButton}
          onPress={() =>
            section === 'suppliers' ? router.push({ pathname: '/supplier/[id]', params: { id: 'new' } }) : router.push('/purchase-order-new')
          }
        >
          <Text style={styles.addButtonText}>{section === 'suppliers' ? '+ Add supplier' : '+ New PO'}</Text>
        </Pressable>
      </View>

      <SectionTabs value={section} onChange={setSection} />

      {section === 'purchaseOrders' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
          {PO_FILTERS.map((filter) => {
            const active = filter === poFilter;
            return (
              <Pressable key={filter} onPress={() => setPoFilter(filter)} style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{filter}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      {section === 'suppliers' ? (
        <>
          {supplierError && <Text style={styles.error}>Could not reach the API: {supplierError}</Text>}
          {!supplierError && suppliers === null && <ActivityIndicator style={styles.loading} />}
          {!supplierError && suppliers !== null && suppliers.length === 0 && <Text style={styles.empty}>No suppliers yet.</Text>}
          {!supplierError && suppliers !== null && suppliers.length > 0 && (
            <FlatList
              style={styles.list}
              data={suppliers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <SupplierCard supplier={item} onPress={() => router.push({ pathname: '/supplier/[id]', params: { id: item.id } })} />
              )}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadSuppliers(true)} />}
            />
          )}
        </>
      ) : (
        <>
          {poError && <Text style={styles.error}>Could not reach the API: {poError}</Text>}
          {!poError && purchaseOrders === null && <ActivityIndicator style={styles.loading} />}
          {!poError && purchaseOrders !== null && purchaseOrders.length === 0 && <Text style={styles.empty}>No purchase orders yet.</Text>}
          {!poError && purchaseOrders !== null && purchaseOrders.length > 0 && (
            <FlatList
              style={styles.list}
              data={purchaseOrders}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <PurchaseOrderCard po={item} onPress={() => router.push({ pathname: '/purchase-order/[id]', params: { id: item.id } })} />
              )}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPurchaseOrders(poFilter, true)} />}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: 'bold' },
  addButton: { backgroundColor: '#007aff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  sectionRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  sectionChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', alignItems: 'center' },
  sectionChipActive: { backgroundColor: '#007aff', borderColor: '#007aff' },
  sectionChipText: { fontSize: 13, fontWeight: '600', opacity: 0.7 },
  sectionChipTextActive: { color: '#fff', opacity: 1 },
  filterScroll: { flexGrow: 0 },
  filterRow: { gap: 8, paddingRight: 8, paddingBottom: 4 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#ccc' },
  filterChipActive: { backgroundColor: '#007aff', borderColor: '#007aff' },
  filterChipText: { fontSize: 13, fontWeight: '500', opacity: 0.7 },
  filterChipTextActive: { color: '#fff', opacity: 1 },
  separator: { marginTop: 12, marginBottom: 12, height: 1, width: '100%' },
  loading: { marginTop: 24 },
  empty: { opacity: 0.6, marginTop: 8 },
  error: { color: '#c0392b', marginBottom: 12 },
  list: { width: '100%' },
  card: { marginBottom: 12, borderRadius: 10 },
  cardPressed: { opacity: 0.7 },
  cardInner: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 14 },
  cardInactive: { opacity: 0.55 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  cardTitle: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  cardMeta: { fontSize: 12, marginTop: 4 },
  total: { fontSize: 17, fontWeight: '700' },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
