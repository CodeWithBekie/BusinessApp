import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, RefreshControl, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ContextMenu, ContextMenuAction } from '@/components/ui/ContextMenu';
import { Icon } from '@/components/ui/Icon';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { apiClient, PurchaseOrderStatus, PurchaseOrderSummary, Supplier, SupplierCategory } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { colorFor, initialsFor } from '@/src/marketplace/avatar';
import { semanticColors, spacing, typography } from '@/constants/theme';
import { formatMoney } from '@/src/common/format';
import { formatRelativeDate } from '@/src/orders/orderStatus';
import { downloadAndShareDocument } from '@/src/documents/downloadAndShare';
import { useCachedFetch } from '@/src/offline/useCachedFetch';
import { deletePreset, getPresets, PurchaseOrderFilterPreset, savePreset } from '@/src/purchaseOrders/filterPresets';
import { SUPPLIER_CATEGORIES } from '@/src/suppliers/supplierCategory';
import { useConfirm } from '@/src/ui/ConfirmContext';
import { useToast } from '@/src/ui/ToastContext';

type Section = 'suppliers' | 'purchaseOrders' | 'analytics';
type PoFilterValue = PurchaseOrderStatus | 'All';
const CHART_HEIGHT = 100;

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
      <Chip label="Analytics" active={value === 'analytics'} onPress={() => onChange('analytics')} style={styles.sectionChip} />
    </View>
  );
}

function SupplierAvatar({ name }: { name: string }) {
  return (
    <View style={[styles.avatar, { backgroundColor: colorFor(name) }]} lightColor="transparent" darkColor="transparent">
      <Text style={styles.avatarText}>{initialsFor(name)}</Text>
    </View>
  );
}

function SupplierCard({ supplier, onPress, onChanged }: { supplier: Supplier; onPress: () => void; onChanged: () => void }) {
  const colorScheme = useColorScheme();
  const { confirm } = useConfirm();
  const { show: showToast } = useToast();

  const toggleActive = useCallback(async () => {
    if (supplier.active) {
      const ok = await confirm({
        title: 'Deactivate this supplier?',
        message: `${supplier.name} won't appear when creating new purchase orders until reactivated.`,
        confirmLabel: 'Deactivate',
        destructive: true,
      });
      if (!ok) return;
    }
    try {
      await apiClient.updateSupplier(supplier.id, { active: !supplier.active });
      showToast(supplier.active ? 'Supplier deactivated.' : 'Supplier reactivated.', 'success');
      onChanged();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }, [supplier, confirm, showToast, onChanged]);

  const actions: ContextMenuAction[] = [
    ...(supplier.contactPhone ? [{ label: 'Call', icon: 'phone' as const, onPress: () => Linking.openURL(`tel:${supplier.contactPhone}`) }] : []),
    ...(supplier.email ? [{ label: 'Email', icon: 'envelope' as const, onPress: () => Linking.openURL(`mailto:${supplier.email}`) }] : []),
    { label: 'Edit', icon: 'pencil', onPress },
    { label: supplier.active ? 'Deactivate' : 'Reactivate', icon: 'xmark.circle', destructive: supplier.active, onPress: toggleActive },
  ];

  return (
    <ContextMenu actions={actions} onPress={onPress} style={({ pressed }) => [styles.cardWrap, pressed && styles.cardPressed]}>
      <Card style={styles.supplierCardInner}>
        <SupplierAvatar name={supplier.name} />
        <View style={styles.supplierCardText} lightColor="transparent" darkColor="transparent">
          <Text style={styles.cardTitle} numberOfLines={1}>
            {supplier.name}
          </Text>
          <Text style={[styles.cardMeta, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]} numberOfLines={1}>
            {[supplier.contactPhone, supplier.email].filter(Boolean).join(' · ') || 'No contact details'}
          </Text>
        </View>
        {!supplier.active && <Badge label="Inactive" color={semanticColors.neutral} />}
      </Card>
    </ContextMenu>
  );
}

function PurchaseOrderCard({ po, onPress }: { po: PurchaseOrderSummary; onPress: () => void }) {
  const colorScheme = useColorScheme();
  const router = useRouter();

  const actions: ContextMenuAction[] = [
    { label: 'View', icon: 'eye', onPress },
    {
      label: 'Download document',
      icon: 'square.and.arrow.down',
      onPress: () => downloadAndShareDocument(`/api/purchase-orders/${po.id}/document`, `purchase-order-${po.id.slice(0, 4)}.pdf`),
    },
    {
      label: 'Ask Assistant about this',
      icon: 'sparkles',
      onPress: () =>
        router.push({
          pathname: '/(tabs)/assistant',
          params: { attachUri: `business://purchase-orders/${po.id}`, attachLabel: `PO #${po.id.slice(0, 4)}` },
        }),
    },
  ];

  return (
    <ContextMenu actions={actions} onPress={onPress} style={({ pressed }) => [styles.cardWrap, pressed && styles.cardPressed]}>
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
    </ContextMenu>
  );
}

interface BarDatum {
  label: string;
  value: number;
  displayValue: string;
  color?: string;
}

// Reuses the same plain-View-bars pattern as (tabs)/sales.tsx's TrendChart/CashFlowChart — no
// charting library, one small component reused for all 6 analytics charts below.
function BarChart({ data, color }: { data: BarDatum[]; color: string }) {
  const colorScheme = useColorScheme();
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.chartRow} lightColor="transparent" darkColor="transparent">
        {data.map((d, index) => {
          const height = Math.max((Math.abs(d.value) / maxAbs) * CHART_HEIGHT, 3);
          return (
            <View key={`${d.label}-${index}`} style={styles.chartBarCol} lightColor="transparent" darkColor="transparent">
              <Text style={styles.chartValue} numberOfLines={1}>
                {d.displayValue}
              </Text>
              <View style={styles.chartBarTrack}>
                <View style={[styles.chartBar, { height, backgroundColor: d.color ?? color }]} />
              </View>
              <Text style={[styles.chartLabel, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]} numberOfLines={1}>
                {d.label}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function AnalyticsChart({ title, data, color }: { title: string; data: BarDatum[]; color: string }) {
  return (
    <Section title={title}>
      {data.length === 0 ? <Text style={styles.chartEmpty}>Not enough data yet.</Text> : <BarChart data={data} color={color} />}
    </Section>
  );
}

function isLatePurchaseOrder(po: PurchaseOrderSummary): boolean {
  if (!po.expectedDeliveryDate) return false;
  const expected = new Date(po.expectedDeliveryDate);
  if (po.status === 'Received') {
    return !!po.receivedAt && new Date(po.receivedAt) > expected;
  }
  return po.status === 'Ordered' && expected.getTime() < Date.now();
}

// All 6 charts derive from the suppliers/purchaseOrders arrays already fetched for the other two
// tabs — no new network calls.
function AnalyticsSection({ suppliers, purchaseOrders }: { suppliers: Supplier[]; purchaseOrders: PurchaseOrderSummary[] }) {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;

  const spendBySupplier = useMemo<BarDatum[]>(() => {
    const bySupplier = new Map<string, { name: string; total: number; currency: string }>();
    for (const po of purchaseOrders) {
      const entry = bySupplier.get(po.supplierId) ?? { name: po.supplierName, total: 0, currency: po.currency };
      entry.total += po.amountPaid;
      bySupplier.set(po.supplierId, entry);
    }
    return Array.from(bySupplier.values())
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
      .map((s) => ({ label: s.name, value: s.total, displayValue: formatMoney(s.total, s.currency) }));
  }, [purchaseOrders]);

  const monthlyOrders = useMemo<BarDatum[]>(() => {
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: 'short' }) });
    }
    const counts = new Map(months.map((m) => [m.key, 0]));
    for (const po of purchaseOrders) {
      const d = new Date(po.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return months.map((m) => ({ label: m.label, value: counts.get(m.key) ?? 0, displayValue: String(counts.get(m.key) ?? 0) }));
  }, [purchaseOrders]);

  const deliveryPerformance = useMemo<BarDatum[]>(() => {
    const bySupplier = new Map<string, { name: string; totalDays: number; count: number }>();
    for (const po of purchaseOrders) {
      if (po.status !== 'Received' || !po.receivedAt || !po.expectedDeliveryDate) continue;
      const days = (new Date(po.receivedAt).getTime() - new Date(po.expectedDeliveryDate).getTime()) / 86_400_000;
      const entry = bySupplier.get(po.supplierId) ?? { name: po.supplierName, totalDays: 0, count: 0 };
      entry.totalDays += days;
      entry.count += 1;
      bySupplier.set(po.supplierId, entry);
    }
    return Array.from(bySupplier.values()).map((s) => {
      const avg = s.totalDays / s.count;
      return {
        label: s.name,
        value: avg,
        color: avg > 0 ? semanticColors.danger : semanticColors.success,
        displayValue: `${avg > 0 ? '+' : ''}${avg.toFixed(1)}d`,
      };
    });
  }, [purchaseOrders]);

  const lateDeliveries = useMemo<BarDatum[]>(() => {
    const bySupplier = new Map<string, { name: string; count: number }>();
    for (const po of purchaseOrders) {
      if (!isLatePurchaseOrder(po)) continue;
      const entry = bySupplier.get(po.supplierId) ?? { name: po.supplierName, count: 0 };
      entry.count += 1;
      bySupplier.set(po.supplierId, entry);
    }
    return Array.from(bySupplier.values())
      .sort((a, b) => b.count - a.count)
      .map((s) => ({ label: s.name, value: s.count, displayValue: String(s.count), color: semanticColors.danger }));
  }, [purchaseOrders]);

  const supplierRatings = useMemo<BarDatum[]>(
    () =>
      suppliers
        .filter((s): s is Supplier & { rating: number } => s.rating != null)
        .map((s) => ({ label: s.name, value: s.rating, displayValue: '★'.repeat(s.rating), color: semanticColors.warning })),
    [suppliers]
  );

  const categoryDistribution = useMemo<BarDatum[]>(() => {
    const counts = new Map<SupplierCategory, number>();
    for (const s of suppliers) {
      if (!s.category) continue;
      counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    }
    return SUPPLIER_CATEGORIES.filter((c) => counts.has(c)).map((c) => ({ label: c, value: counts.get(c)!, displayValue: String(counts.get(c)) }));
  }, [suppliers]);

  return (
    <ScrollView contentContainerStyle={styles.analyticsScroll} showsVerticalScrollIndicator={false}>
      <AnalyticsChart title="Spend by supplier" data={spendBySupplier} color={tint} />
      <AnalyticsChart title="Monthly orders" data={monthlyOrders} color={tint} />
      <AnalyticsChart title="Delivery performance (avg days late)" data={deliveryPerformance} color={semanticColors.danger} />
      <AnalyticsChart title="Late deliveries" data={lateDeliveries} color={semanticColors.danger} />
      <AnalyticsChart title="Supplier ratings" data={supplierRatings} color={semanticColors.warning} />
      <AnalyticsChart title="Category distribution" data={categoryDistribution} color={tint} />
    </ScrollView>
  );
}

function SkeletonRow() {
  return (
    <Card style={styles.skeletonCard}>
      <View style={styles.skeletonRow} lightColor="transparent" darkColor="transparent">
        <Skeleton width={44} height={44} radius={22} />
        <View style={styles.skeletonTextCol} lightColor="transparent" darkColor="transparent">
          <Skeleton width="65%" height={14} />
          <Skeleton width="40%" height={11} style={styles.skeletonGap} />
        </View>
      </View>
    </Card>
  );
}

function EmptyState({ icon, message }: { icon: Parameters<typeof Icon>[0]['name']; message: string }) {
  return (
    <View style={styles.emptyState} lightColor="transparent" darkColor="transparent">
      <Icon name={icon} color={semanticColors.neutral} size={40} />
      <Text style={styles.empty}>{message}</Text>
    </View>
  );
}

export default function SuppliersScreen() {
  const router = useRouter();
  const { prompt, confirm } = useConfirm();
  const [section, setSection] = useState<Section>('suppliers');
  const [poFilter, setPoFilter] = useState<PoFilterValue>('All');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [poSearch, setPoSearch] = useState('');
  const [presets, setPresets] = useState<PurchaseOrderFilterPreset[]>([]);

  useEffect(() => {
    getPresets().then(setPresets);
  }, []);

  const applyPreset = useCallback((preset: PurchaseOrderFilterPreset) => {
    setPoFilter(preset.status);
    setPoSearch(preset.search);
  }, []);

  const handleSavePreset = useCallback(async () => {
    const name = await prompt({ title: 'Save this filter', placeholder: 'e.g. Overdue orders', confirmLabel: 'Save' });
    if (!name) return;
    const next = await savePreset({ name, status: poFilter, search: poSearch });
    setPresets(next);
  }, [prompt, poFilter, poSearch]);

  const handleDeletePreset = useCallback(
    async (name: string) => {
      const ok = await confirm({ title: `Delete "${name}"?`, confirmLabel: 'Delete', destructive: true });
      if (!ok) return;
      const next = await deletePreset(name);
      setPresets(next);
    },
    [confirm]
  );

  const fetchSuppliers = useCallback(() => apiClient.getSuppliers(), []);
  const {
    data: suppliers,
    error: supplierError,
    refreshing: suppliersRefreshing,
    isFromCache: suppliersFromCache,
    reload: loadSuppliers,
  } = useCachedFetch<Supplier[]>('suppliers', fetchSuppliers);

  const fetchPurchaseOrders = useCallback(() => apiClient.getPurchaseOrders(), []);
  const {
    data: purchaseOrders,
    error: poError,
    refreshing: poRefreshing,
    isFromCache: poFromCache,
    reload: loadPurchaseOrders,
  } = useCachedFetch<PurchaseOrderSummary[]>('purchaseOrders:all', fetchPurchaseOrders);

  const refreshing = section === 'suppliers' ? suppliersRefreshing : poRefreshing;

  useFocusEffect(
    useCallback(() => {
      if (section === 'suppliers') {
        loadSuppliers();
      } else if (section === 'purchaseOrders') {
        loadPurchaseOrders();
      } else {
        loadSuppliers();
        loadPurchaseOrders();
      }
    }, [section, loadSuppliers, loadPurchaseOrders])
  );

  const supplierStats = useMemo(() => {
    if (!suppliers) return null;
    const active = suppliers.filter((s) => s.active).length;
    return { active, inactive: suppliers.length - active, total: suppliers.length };
  }, [suppliers]);

  const filteredSuppliers = useMemo(() => {
    if (!suppliers) return null;
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => [s.name, s.contactPhone, s.email].filter(Boolean).some((v) => v!.toLowerCase().includes(q)));
  }, [suppliers, supplierSearch]);

  const poStats = useMemo(() => {
    if (!purchaseOrders) return null;
    const counts: Record<PurchaseOrderStatus, number> = { Draft: 0, Ordered: 0, Received: 0, Cancelled: 0 };
    let totalValue = 0;
    let currency = 'USD';
    for (const po of purchaseOrders) {
      counts[po.status] += 1;
      totalValue += po.totalAmount;
      currency = po.currency;
    }
    return { counts, totalValue, currency };
  }, [purchaseOrders]);

  const filteredPurchaseOrders = useMemo(() => {
    if (!purchaseOrders) return null;
    let list = purchaseOrders;
    if (poFilter !== 'All') list = list.filter((po) => po.status === poFilter);
    const q = poSearch.trim().toLowerCase();
    if (q) list = list.filter((po) => po.supplierName.toLowerCase().includes(q));
    return list;
  }, [purchaseOrders, poFilter, poSearch]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow} lightColor="transparent" darkColor="transparent">
        <Text style={styles.title}>Suppliers</Text>
        {section !== 'analytics' && (
          <Button
            label={section === 'suppliers' ? '+ Add supplier' : '+ New PO'}
            style={styles.addButton}
            onPress={() =>
              section === 'suppliers' ? router.push({ pathname: '/supplier/[id]', params: { id: 'new' } }) : router.push('/purchase-order-new')
            }
          />
        )}
      </View>

      <SectionTabs value={section} onChange={setSection} />

      {section === 'suppliers' ? (
        <>
          {supplierStats && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statScroll} contentContainerStyle={styles.statRow}>
              <StatCard label="Active" value={supplierStats.active} accentColor={semanticColors.success} />
              <StatCard label="Inactive" value={supplierStats.inactive} accentColor={semanticColors.neutral} />
              <StatCard label="Total" value={supplierStats.total} />
            </ScrollView>
          )}
          <View style={styles.searchRow} lightColor="#f2f2f7" darkColor="rgba(255,255,255,0.08)">
            <Icon name="magnifyingglass" color={semanticColors.neutral} size={16} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search suppliers…"
              placeholderTextColor={semanticColors.neutral}
              value={supplierSearch}
              onChangeText={setSupplierSearch}
            />
          </View>
        </>
      ) : section === 'purchaseOrders' ? (
        <>
          {poStats && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statScroll} contentContainerStyle={styles.statRow}>
              <StatCard label="Draft" value={poStats.counts.Draft} accentColor={semanticColors.neutral} />
              <StatCard label="Ordered" value={poStats.counts.Ordered} accentColor={semanticColors.warning} />
              <StatCard label="Received" value={poStats.counts.Received} accentColor={semanticColors.success} />
              <StatCard label="Cancelled" value={poStats.counts.Cancelled} accentColor={semanticColors.danger} />
              <StatCard label="Total value" value={formatMoney(poStats.totalValue, poStats.currency)} />
            </ScrollView>
          )}
          <View style={styles.searchRow} lightColor="#f2f2f7" darkColor="rgba(255,255,255,0.08)">
            <Icon name="magnifyingglass" color={semanticColors.neutral} size={16} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by supplier…"
              placeholderTextColor={semanticColors.neutral}
              value={poSearch}
              onChangeText={setPoSearch}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
            {PO_FILTERS.map((filter) => (
              <Chip key={filter} label={filter} active={filter === poFilter} onPress={() => setPoFilter(filter)} />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
            <Chip label="+ Save filter" active={false} onPress={handleSavePreset} />
            {presets.map((preset) => (
              <Chip
                key={preset.name}
                label={preset.name}
                active={poFilter === preset.status && poSearch === preset.search}
                onPress={() => applyPreset(preset)}
                onLongPress={() => handleDeletePreset(preset.name)}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      {section !== 'analytics' && <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />}

      {section === 'suppliers' ? (
        <>
          {supplierError && <Text style={styles.error}>Could not reach the API: {supplierError}</Text>}
          {suppliersFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
          {!supplierError && filteredSuppliers === null && (
            <View>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          )}
          {!supplierError && filteredSuppliers !== null && filteredSuppliers.length === 0 && (
            <EmptyState icon="person.2" message={supplierSearch ? 'No suppliers match your search.' : 'No suppliers yet.'} />
          )}
          {!supplierError && filteredSuppliers !== null && filteredSuppliers.length > 0 && (
            <FlatList
              style={styles.list}
              data={filteredSuppliers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <SupplierCard
                  supplier={item}
                  onPress={() => router.push({ pathname: '/supplier/[id]', params: { id: item.id } })}
                  onChanged={() => loadSuppliers()}
                />
              )}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadSuppliers(true)} />}
            />
          )}
        </>
      ) : section === 'purchaseOrders' ? (
        <>
          {poError && <Text style={styles.error}>Could not reach the API: {poError}</Text>}
          {poFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
          {!poError && filteredPurchaseOrders === null && (
            <View>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          )}
          {!poError && filteredPurchaseOrders !== null && filteredPurchaseOrders.length === 0 && (
            <EmptyState icon="doc.text" message={poSearch || poFilter !== 'All' ? 'No purchase orders match.' : 'No purchase orders yet.'} />
          )}
          {!poError && filteredPurchaseOrders !== null && filteredPurchaseOrders.length > 0 && (
            <FlatList
              style={styles.list}
              data={filteredPurchaseOrders}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <PurchaseOrderCard po={item} onPress={() => router.push({ pathname: '/purchase-order/[id]', params: { id: item.id } })} />
              )}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPurchaseOrders(true)} />}
            />
          )}
        </>
      ) : (
        <>
          {(supplierError || poError) && <Text style={styles.error}>Could not reach the API: {supplierError ?? poError}</Text>}
          {(suppliers === null || purchaseOrders === null) && !supplierError && !poError && (
            <View>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          )}
          {suppliers !== null && purchaseOrders !== null && <AnalyticsSection suppliers={suppliers} purchaseOrders={purchaseOrders} />}
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
  statScroll: { flexGrow: 0, marginBottom: spacing.md },
  statRow: { gap: spacing.sm, paddingRight: spacing.sm },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15 },
  filterScroll: { flexGrow: 0 },
  filterRow: { gap: spacing.sm, paddingRight: spacing.sm, paddingBottom: 4 },
  separator: { marginTop: 12, marginBottom: 12, height: 1, width: '100%' },
  empty: { opacity: 0.6, marginTop: 12, textAlign: 'center' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 48, paddingBottom: 24 },
  error: { color: semanticColors.danger, marginBottom: 12 },
  cacheNote: { opacity: 0.6, fontSize: 12, marginBottom: 12 },
  list: { width: '100%' },
  cardWrap: { marginBottom: spacing.md },
  cardPressed: { opacity: 0.7 },
  supplierCardInner: { flexDirection: 'row', alignItems: 'center' },
  supplierCardText: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm + 2 },
  cardTitle: { ...typography.bodyStrong, flexShrink: 1 },
  cardMeta: { ...typography.meta, marginTop: 4 },
  total: { fontSize: 17, fontWeight: '700' },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  skeletonCard: { marginBottom: spacing.md },
  skeletonRow: { flexDirection: 'row', alignItems: 'center' },
  skeletonTextCol: { flex: 1, marginLeft: spacing.md },
  skeletonGap: { marginTop: 8 },
  analyticsScroll: { paddingBottom: spacing.xl },
  chartEmpty: { opacity: 0.6, fontSize: 13 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 14, paddingBottom: 4 },
  chartBarCol: { alignItems: 'center', width: 56 },
  chartBarTrack: { height: CHART_HEIGHT, justifyContent: 'flex-end' },
  chartBar: { width: 20, borderRadius: 4 },
  chartValue: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  chartLabel: { fontSize: 10, marginTop: 6, maxWidth: 56, textAlign: 'center' },
});
