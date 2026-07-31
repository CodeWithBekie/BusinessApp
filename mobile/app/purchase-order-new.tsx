import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { apiClient, CatalogItem, CatalogItemType, PurchaseOrderDetail, PurchaseOrderLineItem, Supplier } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { formatMoney } from '@/src/common/format';
import { semanticColors, spacing, typography } from '@/constants/theme';
import { useIsOnline } from '@/src/offline/networkStatus';

const ITEM_TYPES: CatalogItemType[] = ['Stock', 'TimeBased', 'Quote'];

interface ExistingCartLine {
  kind: 'existing';
  key: string;
  item: CatalogItem;
  quantity: number;
  unitCost: string;
}

interface NewCartLine {
  kind: 'new';
  key: string;
  name: string;
  itemType: CatalogItemType;
  unit: string;
  quantity: number;
  unitCost: string;
}

type CartLine = ExistingCartLine | NewCartLine;

function useInputStyle() {
  return [styles.input, styles.inputLight];
}

function SupplierRow({ supplier, onSelect }: { supplier: Supplier; onSelect: () => void }) {
  return (
    <Pressable onPress={onSelect} style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}>
      <Card style={styles.pickerRowInner}>
        <Text style={styles.pickerName}>{supplier.name}</Text>
        <Text style={styles.pickerAdd}>Select</Text>
      </Card>
    </Pressable>
  );
}

function ItemPickerRow({ item, onAdd }: { item: CatalogItem; onAdd: () => void }) {
  return (
    <Pressable onPress={onAdd} style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}>
      <Card style={styles.pickerRowInner}>
        <View style={styles.pickerRowText} lightColor="transparent" darkColor="transparent">
          <Text style={styles.pickerName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.pickerMeta}>
            Sells at {formatMoney(item.price, item.currency)} / {item.unit}
            {item.itemType === 'Stock' ? ` · ${item.stockQuantity ?? 0} in stock` : ''}
          </Text>
        </View>
        <Text style={styles.pickerAdd}>+ Add</Text>
      </Card>
    </Pressable>
  );
}

function CartRow({
  line,
  currency,
  onIncrement,
  onDecrement,
  onCostChange,
  onRemove,
}: {
  line: CartLine;
  currency: string;
  onIncrement: () => void;
  onDecrement: () => void;
  onCostChange: (value: string) => void;
  onRemove: () => void;
}) {
  const inputStyle = useInputStyle();
  const name = line.kind === 'existing' ? line.item.name : line.name;
  return (
    <Card style={styles.cartRow}>
      <View style={styles.cartRowTop} lightColor="transparent" darkColor="transparent">
        <View style={styles.cartRowTitle} lightColor="transparent" darkColor="transparent">
          <Text style={styles.cartName} numberOfLines={1}>
            {name}
          </Text>
          {line.kind === 'new' && <Badge label="New" color={semanticColors.warning} />}
        </View>
        <Pressable onPress={onRemove}>
          <Text style={styles.removeButtonText}>Remove</Text>
        </Pressable>
      </View>
      <View style={styles.cartRowBottom} lightColor="transparent" darkColor="transparent">
        <View style={styles.stepper} lightColor="transparent" darkColor="transparent">
          <Pressable style={styles.stepperButton} onPress={onDecrement}>
            <Text style={styles.stepperButtonText}>−</Text>
          </Pressable>
          <Text style={styles.stepperValue}>{line.quantity}</Text>
          <Pressable style={styles.stepperButton} onPress={onIncrement}>
            <Text style={styles.stepperButtonText}>+</Text>
          </Pressable>
        </View>
        <Text style={styles.costLabel}>Unit cost ({currency})</Text>
        <TextInput style={[inputStyle, styles.costInput]} value={line.unitCost} onChangeText={onCostChange} keyboardType="decimal-pad" />
        <Text style={styles.cartSubtotal}>{formatMoney((Number(line.unitCost) || 0) * line.quantity, currency)}</Text>
      </View>
    </Card>
  );
}

export default function PurchaseOrderNewScreen() {
  const router = useRouter();
  const inputStyle = useInputStyle();
  const isOnline = useIsOnline();

  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');

  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [cart, setCart] = useState<Record<string, CartLine>>({});

  const [showNewItemForm, setShowNewItemForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState<CatalogItemType>('Stock');
  const [newItemUnit, setNewItemUnit] = useState('each');

  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [customCurrency, setCustomCurrency] = useState('');
  const [showCustomCurrency, setShowCustomCurrency] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<PurchaseOrderDetail | null>(null);

  useEffect(() => {
    Promise.all([apiClient.getSuppliers(), apiClient.getCatalog()])
      .then(([supplierData, itemData]) => {
        setSuppliers(supplierData.filter((s) => s.active));
        setItems(itemData);
      })
      .catch((err: Error) => setLoadError(err.message));
  }, []);

  const catalogCurrencies = useMemo(() => {
    const set = new Set((items ?? []).filter((item) => item.active).map((item) => item.currency));
    return Array.from(set);
  }, [items]);

  useEffect(() => {
    if (selectedCurrency === null && catalogCurrencies.length > 0) {
      setSelectedCurrency(catalogCurrencies[0]);
    }
  }, [catalogCurrencies, selectedCurrency]);

  const availableSuppliers = useMemo(() => {
    const term = supplierSearch.trim().toLowerCase();
    if (!term) return suppliers ?? [];
    return (suppliers ?? []).filter((s) => s.name.toLowerCase().includes(term));
  }, [suppliers, supplierSearch]);

  const availableItems = useMemo(() => {
    const activeItems = (items ?? []).filter((item) => item.active);
    const term = itemSearch.trim().toLowerCase();
    if (!term) return activeItems;
    return activeItems.filter((item) => item.name.toLowerCase().includes(term));
  }, [items, itemSearch]);

  const cartLines = Object.values(cart);
  const total = cartLines.reduce((sum, line) => sum + (Number(line.unitCost) || 0) * line.quantity, 0);
  const existingLine = cartLines.find((line): line is ExistingCartLine => line.kind === 'existing');
  const currency = existingLine ? existingLine.item.currency : customCurrency.trim() || selectedCurrency || 'USD';

  const addItem = useCallback((item: CatalogItem) => {
    setCart((prev) => {
      const existing = prev[item.id];
      if (existing && existing.kind === 'existing') {
        return { ...prev, [item.id]: { ...existing, quantity: existing.quantity + 1 } };
      }
      return { ...prev, [item.id]: { kind: 'existing', key: item.id, item, quantity: 1, unitCost: item.price.toFixed(2) } };
    });
  }, []);

  const addNewItem = useCallback(() => {
    const name = newItemName.trim();
    if (!name) return;
    const key = `new-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setCart((prev) => ({
      ...prev,
      [key]: { kind: 'new', key, name, itemType: newItemType, unit: newItemUnit.trim() || 'each', quantity: 1, unitCost: '0.00' },
    }));
    setNewItemName('');
    setNewItemType('Stock');
    setNewItemUnit('each');
    setShowNewItemForm(false);
  }, [newItemName, newItemType, newItemUnit]);

  const incrementItem = useCallback((key: string) => {
    setCart((prev) => ({ ...prev, [key]: { ...prev[key], quantity: prev[key].quantity + 1 } }));
  }, []);

  const decrementItem = useCallback((key: string) => {
    setCart((prev) => {
      const line = prev[key];
      if (!line) return prev;
      if (line.quantity <= 1) {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: { ...line, quantity: line.quantity - 1 } };
    });
  }, []);

  const setCost = useCallback((key: string, value: string) => {
    setCart((prev) => ({ ...prev, [key]: { ...prev[key], unitCost: value } }));
  }, []);

  const removeItem = useCallback((key: string) => {
    setCart((prev) => {
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const createPurchaseOrder = useCallback(async () => {
    setSaveError(null);
    if (!selectedSupplier) {
      setSaveError('Select a supplier.');
      return;
    }
    if (cartLines.length === 0) {
      setSaveError('Add at least one item.');
      return;
    }

    const lineItems: PurchaseOrderLineItem[] = cartLines.map((line) =>
      line.kind === 'existing'
        ? { catalogItemId: line.item.id, quantity: line.quantity, unitCost: Number(line.unitCost) || 0 }
        : {
            newItemName: line.name,
            newItemType: line.itemType,
            newItemUnit: line.unit,
            quantity: line.quantity,
            unitCost: Number(line.unitCost) || 0,
          }
    );

    setSaving(true);
    try {
      const po = await apiClient.createPurchaseOrder(selectedSupplier.id, lineItems, existingLine ? undefined : currency);
      setResult(po);
      setCart({});
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [selectedSupplier, cartLines, existingLine, currency]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'New purchase order' }} />

      {result && (
        <View style={styles.successBanner} lightColor="#e8f5e9" darkColor="rgba(46,125,50,0.2)">
          <Text style={styles.successTitle}>Purchase order created — {formatMoney(result.totalAmount, result.currency)}</Text>
          <Text style={styles.successMeta}>From: {result.supplierName}</Text>
          <Button label="Done" variant="success" style={styles.successDismiss} onPress={() => router.back()} />
        </View>
      )}

      {!result && (
        <>
          {loadError && <Text style={styles.error}>Could not reach the API: {loadError}</Text>}
          {!loadError && (suppliers === null || items === null) && <ActivityIndicator style={styles.loading} />}

          {!loadError && suppliers !== null && items !== null && (
            <>
              <Text style={styles.label}>Supplier</Text>
              {selectedSupplier ? (
                <Card style={styles.selectedCard}>
                  <Text style={styles.selectedName}>{selectedSupplier.name}</Text>
                  <Button label="Change" style={styles.changeButton} onPress={() => setSelectedSupplier(null)} />
                </Card>
              ) : (
                <>
                  <TextInput style={inputStyle} placeholder="Search suppliers…" value={supplierSearch} onChangeText={setSupplierSearch} />
                  <FlatList
                    style={styles.pickerList}
                    data={availableSuppliers}
                    keyExtractor={(s) => s.id}
                    renderItem={({ item }) => <SupplierRow supplier={item} onSelect={() => setSelectedSupplier(item)} />}
                    ListEmptyComponent={<Text style={styles.empty}>No suppliers found. Add one from the Suppliers tab first.</Text>}
                  />
                </>
              )}

              {!existingLine && (
                <>
                  <Text style={styles.label}>Currency (for new items)</Text>
                  <View style={styles.currencyRow} lightColor="transparent" darkColor="transparent">
                    {catalogCurrencies.map((cur) => (
                      <Chip
                        key={cur}
                        label={cur}
                        active={!showCustomCurrency && cur === selectedCurrency}
                        onPress={() => {
                          setShowCustomCurrency(false);
                          setSelectedCurrency(cur);
                        }}
                      />
                    ))}
                    <Chip label="Other…" active={showCustomCurrency} onPress={() => setShowCustomCurrency(true)} />
                  </View>
                  {showCustomCurrency && (
                    <TextInput
                      style={inputStyle}
                      placeholder="e.g. ZAR"
                      value={customCurrency}
                      onChangeText={(v) => setCustomCurrency(v.toUpperCase())}
                      autoCapitalize="characters"
                    />
                  )}
                </>
              )}

              <Text style={styles.label}>Items</Text>
              <TextInput style={inputStyle} placeholder="Search catalog items…" value={itemSearch} onChangeText={setItemSearch} />
              <FlatList
                style={styles.pickerList}
                data={availableItems}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => <ItemPickerRow item={item} onAdd={() => addItem(item)} />}
                ListEmptyComponent={<Text style={styles.empty}>No matching active items.</Text>}
              />

              {!showNewItemForm && (
                <Pressable style={styles.newItemToggle} onPress={() => setShowNewItemForm(true)}>
                  <Text style={styles.newItemToggleText}>+ New item (not in catalog)</Text>
                </Pressable>
              )}

              {showNewItemForm && (
                <Card style={styles.newItemForm}>
                  <TextInput style={inputStyle} placeholder="Item name" value={newItemName} onChangeText={setNewItemName} />
                  <View style={styles.newItemTypeRow} lightColor="transparent" darkColor="transparent">
                    {ITEM_TYPES.map((t) => (
                      <Chip key={t} label={t} active={t === newItemType} onPress={() => setNewItemType(t)} />
                    ))}
                  </View>
                  <TextInput style={inputStyle} placeholder="Unit (e.g. each, bag)" value={newItemUnit} onChangeText={setNewItemUnit} />
                  <View style={styles.newItemActions} lightColor="transparent" darkColor="transparent">
                    <Button label="Cancel" variant="secondary" style={styles.flexButton} onPress={() => setShowNewItemForm(false)} />
                    <Button label="Add to cart" style={styles.flexButton} onPress={addNewItem} />
                  </View>
                </Card>
              )}

              <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

              <ScrollView style={styles.cartSection}>
                <Text style={styles.sectionTitle}>Cart ({cartLines.length})</Text>
                {cartLines.length === 0 && <Text style={styles.empty}>No items added yet.</Text>}
                {cartLines.map((line) => (
                  <CartRow
                    key={line.key}
                    line={line}
                    currency={currency}
                    onIncrement={() => incrementItem(line.key)}
                    onDecrement={() => decrementItem(line.key)}
                    onCostChange={(value) => setCost(line.key, value)}
                    onRemove={() => removeItem(line.key)}
                  />
                ))}

                {cartLines.length > 0 && (
                  <View style={styles.totalRow} lightColor="transparent" darkColor="transparent">
                    <Text style={styles.totalLabel}>Total cost</Text>
                    <Text style={styles.totalValue}>{formatMoney(total, currency)}</Text>
                  </View>
                )}

                {saveError && <Text style={styles.error}>{saveError}</Text>}
                {!isOnline && <Text style={styles.error}>You're offline — connect to create this purchase order.</Text>}

                <Button
                  label={saving ? 'Creating…' : 'Create purchase order'}
                  style={styles.createButton}
                  disabled={saving || cartLines.length === 0 || !selectedSupplier || !isOnline}
                  onPress={createPurchaseOrder}
                />
              </ScrollView>
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 16 },
  loading: { marginTop: 24 },
  error: { color: semanticColors.danger, marginTop: 8, marginBottom: 8 },
  empty: { opacity: 0.6, marginTop: 8, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', opacity: 0.7, marginTop: spacing.lg, marginBottom: spacing.xs + 2 },
  sectionTitle: { ...typography.bodyStrong, fontSize: 15, marginBottom: spacing.sm },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  inputLight: { color: '#000' },
  pickerList: { maxHeight: 160, marginTop: 8 },
  pickerRow: { marginBottom: spacing.sm },
  pickerRowPressed: { opacity: 0.7 },
  pickerRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
  },
  pickerRowText: { flexShrink: 1, marginRight: 8 },
  pickerName: { fontSize: 14, fontWeight: '600' },
  pickerMeta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  pickerAdd: { fontSize: 13, fontWeight: '700', color: '#007aff' },
  separator: { marginTop: 12, marginBottom: 12, height: 1, width: '100%' },
  cartSection: { flex: 1 },
  cartRow: { padding: 10, marginBottom: spacing.sm + 2 },
  cartRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cartRowTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  cartRowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  cartName: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  cartSubtotal: { fontSize: 13, fontWeight: '700', marginLeft: 'auto' },
  costLabel: { fontSize: 11, opacity: 0.6 },
  costInput: { width: 70, paddingVertical: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperButton: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  stepperButtonText: { fontSize: 14, fontWeight: '700' },
  stepperValue: { fontSize: 13, fontWeight: '600', minWidth: 16, textAlign: 'center' },
  removeButtonText: { fontSize: 12, color: semanticColors.danger, fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ccc' },
  totalLabel: { fontSize: 15, fontWeight: '700' },
  totalValue: { fontSize: 17, fontWeight: '800' },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedName: { fontSize: 14, fontWeight: '700' },
  changeButton: { paddingHorizontal: 12, paddingVertical: 6 },
  createButton: { marginTop: spacing.xl, marginBottom: spacing.sm },
  successBanner: { borderRadius: 10, padding: 16, marginTop: 16 },
  successTitle: { fontSize: 16, fontWeight: '700' },
  successMeta: { fontSize: 13, opacity: 0.7, marginTop: 4 },
  successDismiss: { marginTop: 16 },
  currencyRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.sm },
  newItemToggle: { paddingVertical: 10, marginTop: 4 },
  newItemToggleText: { color: '#007aff', fontWeight: '600', fontSize: 13 },
  newItemForm: { marginTop: 8, gap: 8 },
  newItemTypeRow: { flexDirection: 'row', gap: spacing.sm },
  newItemActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  flexButton: { flex: 1 },
});
