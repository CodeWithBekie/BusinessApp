import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, TextInput } from 'react-native';

import { apiClient, CatalogItem } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { semanticColors, shadows } from '@/constants/theme';
import { formatMoney } from '@/src/common/format';
import { useCachedFetch } from '@/src/offline/useCachedFetch';
import { useIsOnline } from '@/src/offline/networkStatus';

interface CartLine {
  item: CatalogItem;
  quantity: number;
}

function Stepper({ quantity, tint, onIncrement, onDecrement, atMax }: { quantity: number; tint: string; onIncrement: () => void; onDecrement: () => void; atMax: boolean }) {
  return (
    <View style={[styles.stepper, { borderColor: tint }]} lightColor="transparent" darkColor="transparent">
      <Pressable style={styles.stepperButton} onPress={onDecrement} hitSlop={8}>
        <Icon name="minus" color={tint} size={14} />
      </Pressable>
      <Text style={[styles.stepperValue, { color: tint }]}>{quantity}</Text>
      <Pressable style={[styles.stepperButton, atMax && styles.stepperButtonDisabled]} onPress={atMax ? undefined : onIncrement} disabled={atMax} hitSlop={8}>
        <Icon name="plus" color={atMax ? '#c0c0c5' : tint} size={14} />
      </Pressable>
    </View>
  );
}

function ItemRow({
  item,
  quantity,
  tint,
  onAdd,
  onIncrement,
  onDecrement,
}: {
  item: CatalogItem;
  quantity: number;
  tint: string;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const stock = item.stockQuantity ?? 0;
  const outOfStock = item.itemType === 'Stock' && stock <= 0;
  const atMax = item.itemType === 'Stock' && quantity >= stock;
  const lowStock = item.itemType === 'Stock' && !outOfStock && stock <= 5;

  return (
    <Card style={[styles.itemRow, outOfStock && styles.itemRowDisabled]}>
      {item.hasImage ? (
        <Image source={{ uri: apiClient.getCatalogItemImageUrl(item.id, item.updatedAt) }} style={styles.itemThumb} />
      ) : (
        <View style={styles.itemThumbPlaceholder} lightColor="#f2f2f7" darkColor="rgba(255,255,255,0.08)">
          <Icon name="cube.box" color={semanticColors.neutral} size={22} />
        </View>
      )}
      <View style={styles.itemRowText} lightColor="transparent" darkColor="transparent">
        <Text style={styles.itemName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.itemMetaRow} lightColor="transparent" darkColor="transparent">
          <Text style={[styles.itemPrice, { color: tint }]}>{formatMoney(item.price, item.currency)}</Text>
          <Text style={styles.itemUnit}> / {item.unit}</Text>
        </View>
        {outOfStock ? (
          <Text style={styles.outOfStockText}>Out of stock</Text>
        ) : (
          lowStock && <Text style={styles.lowStockText}>Only {stock} left</Text>
        )}
      </View>
      <View style={styles.itemAction} lightColor="transparent" darkColor="transparent">
        {outOfStock ? null : quantity > 0 ? (
          <Stepper quantity={quantity} tint={tint} onIncrement={onIncrement} onDecrement={onDecrement} atMax={atMax} />
        ) : (
          <Pressable style={[styles.addButton, { backgroundColor: tint }]} onPress={onAdd} hitSlop={8}>
            <Icon name="plus" color="#fff" size={16} />
          </Pressable>
        )}
      </View>
    </Card>
  );
}

export default function BusinessStorefrontScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isOnline = useIsOnline();
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [vatRate, setVatRate] = useState(0);
  const [businessName, setBusinessName] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiClient
      .getMarketplaceBusiness(id)
      .then((business) => {
        setVatRate(business.vatRate);
        setBusinessName(business.name);
      })
      .catch(() => {});
  }, [id]);

  const fetchCatalog = useCallback(() => apiClient.getMarketplaceCatalog(id), [id]);
  const { data: items, error, isFromCache, reload: load } = useCachedFetch<CatalogItem[]>(`marketplace:catalog:${id}`, fetchCatalog);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const addItem = useCallback((item: CatalogItem) => {
    setCart((prev) => {
      const existing = prev[item.id];
      const nextQuantity = (existing?.quantity ?? 0) + 1;
      if (item.itemType === 'Stock' && nextQuantity > (item.stockQuantity ?? 0)) return prev;
      return { ...prev, [item.id]: { item, quantity: nextQuantity } };
    });
  }, []);

  const incrementItem = useCallback((itemId: string) => {
    setCart((prev) => {
      const line = prev[itemId];
      if (!line) return prev;
      if (line.item.itemType === 'Stock' && line.quantity + 1 > (line.item.stockQuantity ?? 0)) return prev;
      return { ...prev, [itemId]: { ...line, quantity: line.quantity + 1 } };
    });
  }, []);

  const decrementItem = useCallback((itemId: string) => {
    setCart((prev) => {
      const line = prev[itemId];
      if (!line) return prev;
      if (line.quantity <= 1) {
        const { [itemId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: { ...line, quantity: line.quantity - 1 } };
    });
  }, []);

  const cartLines = Object.values(cart);
  const itemCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const total = cartLines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const vatAmount = Math.round(total * vatRate * 100) / 100;
  const grandTotal = total + vatAmount;
  const currency = cartLines[0]?.item.currency ?? 'USD';

  const availableItems = (items ?? []).filter((item) => item.active && item.name.toLowerCase().includes(search.trim().toLowerCase()));

  const goToCheckout = useCallback(() => {
    router.push({
      pathname: '/checkout',
      params: {
        businessId: id,
        items: JSON.stringify(
          cartLines.map((line) => ({
            catalogItemId: line.item.id,
            name: line.item.name,
            price: line.item.price,
            currency: line.item.currency,
            quantity: line.quantity,
          }))
        ),
      },
    });
  }, [router, id, cartLines]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: businessName ?? 'Storefront' }} />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && items === null && <ActivityIndicator style={styles.loading} />}

      {!error && items !== null && (
        <>
          <View style={styles.searchRow} lightColor="#f2f2f7" darkColor="rgba(255,255,255,0.08)">
            <Icon name="magnifyingglass" color={semanticColors.neutral} size={16} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search items…"
              placeholderTextColor="#8e8e93"
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <FlatList
            style={styles.pickerList}
            contentContainerStyle={[styles.pickerListContent, cartLines.length > 0 && styles.pickerListContentWithBar]}
            data={availableItems}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ItemRow
                item={item}
                quantity={cart[item.id]?.quantity ?? 0}
                tint={tint}
                onAdd={() => addItem(item)}
                onIncrement={() => incrementItem(item.id)}
                onDecrement={() => decrementItem(item.id)}
              />
            )}
            ListEmptyComponent={<Text style={styles.empty}>No matching items.</Text>}
          />

          {cartLines.length > 0 && (
            <View style={styles.cartBarWrapper} lightColor="transparent" darkColor="transparent">
              {!isOnline && <Text style={styles.offlineNotice}>You're offline — connect to check out.</Text>}
              <Pressable
                style={[styles.cartBar, { backgroundColor: tint }, !isOnline && styles.buttonDisabled]}
                disabled={!isOnline}
                onPress={goToCheckout}
              >
                <View style={styles.cartBarCount} lightColor="rgba(255,255,255,0.25)" darkColor="rgba(255,255,255,0.25)">
                  <Text style={styles.cartBarCountText}>{itemCount}</Text>
                </View>
                <Text style={styles.cartBarLabel}>View cart</Text>
                <Text style={styles.cartBarTotal}>{formatMoney(grandTotal, currency)}</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16, paddingHorizontal: 16 },
  loading: { marginTop: 24 },
  error: { color: semanticColors.danger, marginBottom: 12 },
  cacheNote: { opacity: 0.6, fontSize: 12, marginBottom: 12 },
  empty: { opacity: 0.6, marginTop: 8, marginBottom: 8 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 2,
    marginBottom: 14,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15 },
  pickerList: { flex: 1 },
  pickerListContent: { paddingBottom: 16 },
  pickerListContentWithBar: { paddingBottom: 88 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 10,
  },
  itemRowDisabled: { opacity: 0.5 },
  itemThumb: { width: 56, height: 56, borderRadius: 10, marginRight: 12 },
  itemThumbPlaceholder: { width: 56, height: 56, borderRadius: 10, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  itemRowText: { flex: 1, marginRight: 8 },
  itemName: { fontSize: 15, fontWeight: '600' },
  itemMetaRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 3 },
  itemPrice: { fontSize: 14, fontWeight: '700' },
  itemUnit: { fontSize: 12, opacity: 0.55 },
  outOfStockText: { fontSize: 12, color: semanticColors.danger, fontWeight: '600', marginTop: 3 },
  lowStockText: { fontSize: 12, color: semanticColors.warning, fontWeight: '600', marginTop: 3 },
  itemAction: { alignItems: 'flex-end', justifyContent: 'center' },
  addButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 8, paddingVertical: 4 },
  stepperButton: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  stepperButtonDisabled: { opacity: 0.4 },
  stepperValue: { fontSize: 14, fontWeight: '700', minWidth: 16, textAlign: 'center' },
  cartBarWrapper: { position: 'absolute', left: 16, right: 16, bottom: 16 },
  offlineNotice: { color: semanticColors.danger, fontSize: 12, marginBottom: 8, textAlign: 'center' },
  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...shadows.floating,
  },
  buttonDisabled: { opacity: 0.6 },
  cartBarCount: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  cartBarCountText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  cartBarLabel: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
  cartBarTotal: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
