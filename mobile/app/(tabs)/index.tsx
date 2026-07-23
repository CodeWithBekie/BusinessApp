import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { apiClient, CatalogItem } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { CATALOG_ITEM_TYPE_COLORS, CATALOG_ITEM_TYPE_LABELS, formatMoney } from '@/src/catalog/catalogItemType';

type FilterValue = 'All' | 'Active' | 'Inactive';

const FILTERS: readonly FilterValue[] = ['All', 'Active', 'Inactive'];

function TypeBadge({ item }: { item: CatalogItem }) {
  return (
    <View style={[styles.badge, { backgroundColor: CATALOG_ITEM_TYPE_COLORS[item.itemType] }]}>
      <Text style={styles.badgeText}>{CATALOG_ITEM_TYPE_LABELS[item.itemType]}</Text>
    </View>
  );
}

function CatalogCard({ item, onPress }: { item: CatalogItem; onPress: () => void }) {
  const colorScheme = useColorScheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={[styles.cardInner, !item.active && styles.cardInactive]} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
        <View style={styles.cardTopRow} lightColor="transparent" darkColor="transparent">
          <Text style={styles.itemName} numberOfLines={1}>
            {item.name}
          </Text>
          <TypeBadge item={item} />
        </View>
        <View style={styles.cardBottomRow} lightColor="transparent" darkColor="transparent">
          <Text style={styles.price}>
            {formatMoney(item.price, item.currency)} / {item.unit}
          </Text>
          <Text style={[styles.meta, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
            {item.itemType === 'Stock' ? `${item.stockQuantity ?? 0} in stock` : 'No stock tracking'}
            {!item.active ? ' · Inactive' : ''}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function FilterTabs({ value, onChange }: { value: FilterValue; onChange: (value: FilterValue) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
      {FILTERS.map((filter) => {
        const active = filter === value;
        return (
          <Pressable key={filter} onPress={() => onChange(filter)} style={[styles.filterChip, active && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{filter}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function CatalogScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterValue>('Active');
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    apiClient
      .getCatalog()
      .then((data) => {
        setItems(data);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setRefreshing(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const visibleItems = (items ?? []).filter((item) => {
    if (filter === 'Active') return item.active;
    if (filter === 'Inactive') return !item.active;
    return true;
  });

  return (
    <View style={styles.container}>
      <View style={styles.headerRow} lightColor="transparent" darkColor="transparent">
        <Text style={styles.title}>Catalog</Text>
        <Pressable
          style={styles.addButton}
          onPress={() => router.push({ pathname: '/catalog-item/[id]', params: { id: 'new' } })}
        >
          <Text style={styles.addButtonText}>+ Add item</Text>
        </Pressable>
      </View>
      <FilterTabs value={filter} onChange={setFilter} />
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {!error && items === null && <ActivityIndicator style={styles.loading} />}
      {!error && items !== null && visibleItems.length === 0 && (
        <Text style={styles.empty}>No {filter === 'All' ? '' : filter.toLowerCase() + ' '}catalog items yet.</Text>
      )}
      {!error && items !== null && visibleItems.length > 0 && (
        <FlatList
          style={styles.list}
          data={visibleItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CatalogCard item={item} onPress={() => router.push({ pathname: '/catalog-item/[id]', params: { id: item.id } })} />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        />
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
  filterScroll: { flexGrow: 0 },
  filterRow: { gap: 8, paddingRight: 8, paddingBottom: 4 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ccc',
  },
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
  itemName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  price: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 12 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
