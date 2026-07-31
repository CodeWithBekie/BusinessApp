import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { apiClient, CatalogItem } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { radius, semanticColors, spacing, typography } from '@/constants/theme';
import { CATALOG_ITEM_TYPE_COLORS, CATALOG_ITEM_TYPE_LABELS, formatMoney } from '@/src/catalog/catalogItemType';
import { useCachedFetch } from '@/src/offline/useCachedFetch';
import { useHasPermission } from '@/src/auth/permissions';

type FilterValue = 'All' | 'Active' | 'Inactive' | 'Low stock';

const FILTERS: readonly FilterValue[] = ['All', 'Active', 'Inactive', 'Low stock'];

function CatalogThumbnail({ item }: { item: CatalogItem }) {
  const [failed, setFailed] = useState(false);
  if (item.hasImage && !failed) {
    return (
      <Image
        source={{ uri: apiClient.getCatalogItemImageUrl(item.id, item.updatedAt) }}
        style={styles.thumbnail}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[styles.thumbnail, styles.thumbnailPlaceholder, { backgroundColor: CATALOG_ITEM_TYPE_COLORS[item.itemType] }]}>
      <Text style={styles.thumbnailPlaceholderText}>{item.name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function CatalogCard({ item, onPress }: { item: CatalogItem; onPress?: () => void }) {
  const colorScheme = useColorScheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.cardWrap, pressed && onPress && styles.cardPressed]}>
      <Card style={[styles.cardInner, !item.active && styles.cardInactive]}>
        <CatalogThumbnail item={item} />
        <View style={styles.cardContent} lightColor="transparent" darkColor="transparent">
          <View style={styles.cardTopRow} lightColor="transparent" darkColor="transparent">
            <Text style={styles.itemName} numberOfLines={1}>
              {item.name}
            </Text>
            <Badge label={CATALOG_ITEM_TYPE_LABELS[item.itemType]} color={CATALOG_ITEM_TYPE_COLORS[item.itemType]} />
          </View>
          <View style={styles.cardBottomRow} lightColor="transparent" darkColor="transparent">
            <Text style={styles.price}>
              {formatMoney(item.price, item.currency)} / {item.unit}
            </Text>
            <Text
              style={[
                styles.meta,
                colorScheme === 'dark' ? styles.metaDark : styles.metaLight,
                item.itemType === 'Stock' && (item.stockQuantity ?? 0) <= 0 && styles.metaOutOfStock,
                item.itemType === 'Stock' && (item.stockQuantity ?? 0) > 0 && item.isLowStock && styles.metaLowStock,
              ]}
            >
              {item.itemType === 'Stock' ? `${item.stockQuantity ?? 0} in stock` : 'No stock tracking'}
              {!item.active ? ' · Inactive' : ''}
            </Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function FilterTabs({ value, onChange }: { value: FilterValue; onChange: (value: FilterValue) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
      {FILTERS.map((filter) => (
        <Chip key={filter} label={filter} active={filter === value} onPress={() => onChange(filter)} />
      ))}
    </ScrollView>
  );
}

export default function CatalogScreen() {
  const router = useRouter();
  const canManageCatalog = useHasPermission('ManageCatalog');
  const [filter, setFilter] = useState<FilterValue>('Active');
  const fetchCatalog = useCallback(() => apiClient.getCatalog(), []);
  const { data: items, error, refreshing, isFromCache, reload: load } = useCachedFetch<CatalogItem[]>('catalog', fetchCatalog);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const visibleItems = (items ?? []).filter((item) => {
    if (filter === 'Active') return item.active;
    if (filter === 'Inactive') return !item.active;
    if (filter === 'Low stock') return item.isLowStock;
    return true;
  });

  return (
    <View style={styles.container}>
      <View style={styles.headerRow} lightColor="transparent" darkColor="transparent">
        <Text style={styles.title}>Catalog</Text>
        {canManageCatalog && (
          <Button label="+ Add item" style={styles.addButton} onPress={() => router.push({ pathname: '/catalog-item/[id]', params: { id: 'new' } })} />
        )}
      </View>
      <FilterTabs value={filter} onChange={setFilter} />
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
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
            <CatalogCard
              item={item}
              onPress={canManageCatalog ? () => router.push({ pathname: '/catalog-item/[id]', params: { id: item.id } }) : undefined}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { ...typography.title },
  addButton: { paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm },
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
  cardInner: { flexDirection: 'row', gap: spacing.md },
  cardInactive: { opacity: 0.55 },
  cardContent: { flex: 1 },
  thumbnail: { width: 48, height: 48, borderRadius: radius.sm },
  thumbnailPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbnailPlaceholderText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  itemName: { ...typography.bodyStrong, flexShrink: 1 },
  cardBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm + 2 },
  price: { fontSize: 16, fontWeight: '700' },
  meta: { ...typography.meta },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  metaLowStock: { color: semanticColors.warning, fontWeight: '600' },
  metaOutOfStock: { color: semanticColors.danger, fontWeight: '600' },
});
