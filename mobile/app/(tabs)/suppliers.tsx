import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { apiClient, PurchaseOrderStatus, PurchaseOrderSummary, Supplier } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { semanticColors, spacing, typography } from '@/constants/theme';
import { formatMoney } from '@/src/common/format';
import { formatRelativeDate } from '@/src/orders/orderStatus';
import { useCachedFetch } from '@/src/offline/useCachedFetch';

type Section = 'suppliers' | 'purchaseOrders';
type PoFilterValue = PurchaseOrderStatus | 'All';

const PO_FILTERS: readonly PoFilterValue[] = ['All', 'Draft', 'Ordered', 'Received', 'Cancelled'];

const PO_STATUS_COLORS: Record<PurchaseOrderStatus, string> = {
  Draft: semanticColors.neutral,
  Ordered: semanticColors.warning,
  Received: semanticColors.success,
  Cancelled: semanticColors.danger,
};

function SectionTabs({ value, onChange }: { value: Section; onChange: (value: Section) => void }) {
  return (
    <View style={styles.sectionRow} lightColor="transparent" darkColor="transparent">
      <Chip label="Suppliers" active={value === 'suppliers'} onPress={() => onChange('suppliers')} style={styles.sectionChip} />
      <Chip label="Purchase Orders" active={value === 'purchaseOrders'} onPress={() => onChange('purchaseOrders')} style={styles.sectionChip} />
    </View>
  );
}

function SupplierCard({ supplier, onPress }: { supplier: Supplier; onPress: () => void }) {
  const colorScheme = useColorScheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cardWrap, pressed && styles.cardPressed]}>
      <Card style={supplier.active ? undefined : styles.cardInactive}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {supplier.name}
        </Text>
        <Text style={[styles.cardMeta, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
          {[supplier.contactPhone, supplier.email].filter(Boolean).join(' · ') || 'No contact details'}
          {!supplier.active ? ' · Inactive' : ''}
        </Text>
      </Card>
    </Pressable>
  );
}

function PurchaseOrderCard({ po, onPress }: { po: PurchaseOrderSummary; onPress: () => void }) {
  const colorScheme = useColorScheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cardWrap, pressed && styles.cardPressed]}>
      <Card>
        <View style={styles.cardTopRow} lightColor="transparent" darkColor="transparent">
          <Text style={styles.cardTitle} numberOfLines={1}>
            {po.supplierName}
          </Text>
          <Badge label={po.status} color={PO_STATUS_COLORS[po.status]} />
        </View>
        <View style={styles.cardBottomRow} lightColor="transparent" darkColor="transparent">
          <Text style={styles.total}>{formatMoney(po.totalAmount, po.currency)}</Text>
          <Text style={[styles.cardMeta, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
            {po.itemCount} item{po.itemCount === 1 ? '' : 's'} · {formatRelativeDate(po.createdAt)}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

export default function SuppliersScreen() {
  const router = useRouter();
  const [section, setSection] = useState<Section>('suppliers');
  const [poFilter, setPoFilter] = useState<PoFilterValue>('All');

  const fetchSuppliers = useCallback(() => apiClient.getSuppliers(), []);
  const {
    data: suppliers,
    error: supplierError,
    refreshing: suppliersRefreshing,
    isFromCache: suppliersFromCache,
    reload: loadSuppliers,
  } = useCachedFetch<Supplier[]>('suppliers', fetchSuppliers);

  const fetchPurchaseOrders = useCallback(() => apiClient.getPurchaseOrders(poFilter === 'All' ? undefined : poFilter), [poFilter]);
  const {
    data: purchaseOrders,
    error: poError,
    refreshing: poRefreshing,
    isFromCache: poFromCache,
    reload: loadPurchaseOrders,
  } = useCachedFetch<PurchaseOrderSummary[]>(`purchaseOrders:${poFilter}`, fetchPurchaseOrders);

  const refreshing = section === 'suppliers' ? suppliersRefreshing : poRefreshing;

  useFocusEffect(
    useCallback(() => {
      if (section === 'suppliers') {
        loadSuppliers();
      } else {
        loadPurchaseOrders();
      }
    }, [section, loadSuppliers, loadPurchaseOrders])
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow} lightColor="transparent" darkColor="transparent">
        <Text style={styles.title}>Suppliers</Text>
        <Button
          label={section === 'suppliers' ? '+ Add supplier' : '+ New PO'}
          style={styles.addButton}
          onPress={() =>
            section === 'suppliers' ? router.push({ pathname: '/supplier/[id]', params: { id: 'new' } }) : router.push('/purchase-order-new')
          }
        />
      </View>

      <SectionTabs value={section} onChange={setSection} />

      {section === 'purchaseOrders' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
          {PO_FILTERS.map((filter) => (
            <Chip key={filter} label={filter} active={filter === poFilter} onPress={() => setPoFilter(filter)} />
          ))}
        </ScrollView>
      )}

      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      {section === 'suppliers' ? (
        <>
          {supplierError && <Text style={styles.error}>Could not reach the API: {supplierError}</Text>}
          {suppliersFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
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
          {poFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
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
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPurchaseOrders(true)} />}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { ...typography.title },
  addButton: { paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm },
  sectionRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  sectionChip: { flex: 1, alignItems: 'center' },
  filterScroll: { flexGrow: 0 },
  filterRow: { gap: spacing.sm, paddingRight: spacing.sm, paddingBottom: 4 },
  separator: { marginTop: 12, marginBottom: 12, height: 1, width: '100%' },
  loading: { marginTop: 24 },
  empty: { opacity: 0.6, marginTop: 8 },
  error: { color: semanticColors.danger, marginBottom: 12 },
  cacheNote: { opacity: 0.6, fontSize: 12, marginBottom: 12 },
  list: { width: '100%' },
  cardWrap: { marginBottom: spacing.md },
  cardPressed: { opacity: 0.7 },
  cardInactive: { opacity: 0.55 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm + 2 },
  cardTitle: { ...typography.bodyStrong, flexShrink: 1 },
  cardMeta: { ...typography.meta, marginTop: 4 },
  total: { fontSize: 17, fontWeight: '700' },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
});
