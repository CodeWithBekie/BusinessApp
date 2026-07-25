import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput } from 'react-native';

import { apiClient, CatalogItem } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { formatMoney } from '@/src/common/format';
import { useCachedFetch } from '@/src/offline/useCachedFetch';
import { useIsOnline } from '@/src/offline/networkStatus';

interface CartLine {
  item: CatalogItem;
  quantity: number;
}

function ItemRow({ item, onAdd }: { item: CatalogItem; onAdd: () => void }) {
  const outOfStock = item.itemType === 'Stock' && (item.stockQuantity ?? 0) <= 0;
  return (
    <Pressable
      onPress={outOfStock ? undefined : onAdd}
      disabled={outOfStock}
      style={({ pressed }) => [styles.itemRow, pressed && styles.itemRowPressed, outOfStock && styles.itemRowDisabled]}
    >
      <View style={styles.itemRowInner} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
        <View style={styles.itemRowText} lightColor="transparent" darkColor="transparent">
          <Text style={styles.itemName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.itemMeta}>
            {formatMoney(item.price, item.currency)} / {item.unit}
            {item.itemType === 'Stock' ? ` · ${item.stockQuantity ?? 0} in stock` : ''}
          </Text>
        </View>
        <Text style={styles.addText}>{outOfStock ? 'Out of stock' : '+ Add'}</Text>
      </View>
    </Pressable>
  );
}

function CartRow({ line, onIncrement, onDecrement }: { line: CartLine; onIncrement: () => void; onDecrement: () => void }) {
  return (
    <View style={styles.cartRow} lightColor="transparent" darkColor="transparent">
      <Text style={styles.cartName} numberOfLines={1}>
        {line.item.name}
      </Text>
      <View style={styles.stepper} lightColor="transparent" darkColor="transparent">
        <Pressable style={styles.stepperButton} onPress={onDecrement}>
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{line.quantity}</Text>
        <Pressable style={styles.stepperButton} onPress={onIncrement}>
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>
      <Text style={styles.cartSubtotal}>{formatMoney(line.item.price * line.quantity, line.item.currency)}</Text>
    </View>
  );
}

export default function BusinessStorefrontScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isOnline = useIsOnline();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, CartLine>>({});

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
  const total = cartLines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
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
      <Stack.Screen options={{ title: 'Storefront' }} />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && items === null && <ActivityIndicator style={styles.loading} />}

      {!error && items !== null && (
        <>
          <TextInput style={styles.search} placeholder="Search items…" value={search} onChangeText={setSearch} />
          <FlatList
            style={styles.pickerList}
            data={availableItems}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ItemRow item={item} onAdd={() => addItem(item)} />}
            ListEmptyComponent={<Text style={styles.empty}>No matching items.</Text>}
          />

          <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
          <Text style={styles.sectionTitle}>Cart ({cartLines.length})</Text>
          {cartLines.length === 0 && <Text style={styles.empty}>No items added yet.</Text>}
          {cartLines.map((line) => (
            <CartRow key={line.item.id} line={line} onIncrement={() => incrementItem(line.item.id)} onDecrement={() => decrementItem(line.item.id)} />
          ))}

          {cartLines.length > 0 && (
            <>
              <View style={styles.totalRow} lightColor="transparent" darkColor="transparent">
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{formatMoney(total, currency)}</Text>
              </View>
              {!isOnline && <Text style={styles.error}>You're offline — connect to check out.</Text>}
              <Pressable style={[styles.checkoutButton, !isOnline && styles.buttonDisabled]} disabled={!isOnline} onPress={goToCheckout}>
                <Text style={styles.checkoutButtonText}>Checkout</Text>
              </Pressable>
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 24 },
  loading: { marginTop: 24 },
  error: { color: '#c0392b', marginBottom: 12 },
  cacheNote: { opacity: 0.6, fontSize: 12, marginBottom: 12 },
  empty: { opacity: 0.6, marginTop: 8, marginBottom: 8 },
  search: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10 },
  pickerList: { maxHeight: 260 },
  itemRow: { marginBottom: 8, borderRadius: 8 },
  itemRowPressed: { opacity: 0.7 },
  itemRowDisabled: { opacity: 0.5 },
  itemRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
  },
  itemRowText: { flexShrink: 1, marginRight: 8 },
  itemName: { fontSize: 14, fontWeight: '600' },
  itemMeta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  addText: { fontSize: 13, fontWeight: '700', color: '#007aff' },
  separator: { marginTop: 12, marginBottom: 12, height: 1, width: '100%' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  cartRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 },
  cartName: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperButton: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  stepperButtonText: { fontSize: 15, fontWeight: '700' },
  stepperValue: { fontSize: 13, fontWeight: '600', minWidth: 16, textAlign: 'center' },
  cartSubtotal: { fontSize: 13, fontWeight: '700', minWidth: 70, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ccc' },
  totalLabel: { fontSize: 15, fontWeight: '700' },
  totalValue: { fontSize: 17, fontWeight: '800' },
  checkoutButton: { backgroundColor: '#007aff', paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  buttonDisabled: { opacity: 0.6 },
  checkoutButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
