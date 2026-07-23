import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { apiClient, CatalogItem, CatalogItemType } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { CATALOG_ITEM_TYPE_LABELS, CATALOG_ITEM_TYPES } from '@/src/catalog/catalogItemType';

function useInputStyle() {
  const colorScheme = useColorScheme();
  return [styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight];
}

export default function CatalogItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const inputStyle = useInputStyle();
  const isNew = id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [existing, setExisting] = useState<CatalogItem | null>(null);

  const [name, setName] = useState('');
  const [itemType, setItemType] = useState<CatalogItemType>('Stock');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [unit, setUnit] = useState('each');
  const [stockQuantity, setStockQuantity] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);

  useEffect(() => {
    if (isNew) return;
    apiClient
      .getCatalog()
      .then((items) => {
        const item = items.find((i) => i.id === id);
        if (!item) {
          setLoadError('Catalog item not found.');
          return;
        }
        setExisting(item);
        setName(item.name);
        setItemType(item.itemType);
        setPrice(item.price.toString());
        setCurrency(item.currency);
        setUnit(item.unit);
        setStockQuantity(item.stockQuantity?.toString() ?? '');
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const save = useCallback(async () => {
    setSaveError(null);
    if (!name.trim()) {
      setSaveError('Name is required.');
      return;
    }
    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setSaveError('Price must be a valid non-negative number.');
      return;
    }
    let parsedStock: number | null = null;
    if (itemType === 'Stock') {
      parsedStock = stockQuantity.trim() === '' ? 0 : Number(stockQuantity);
      if (!Number.isFinite(parsedStock) || parsedStock < 0 || !Number.isInteger(parsedStock)) {
        setSaveError('Stock quantity must be a valid non-negative whole number.');
        return;
      }
    }

    setSaving(true);
    try {
      if (isNew) {
        await apiClient.createCatalogItem({
          name: name.trim(),
          itemType,
          price: parsedPrice,
          currency: currency.trim() || 'USD',
          unit: unit.trim() || 'each',
          stockQuantity: parsedStock,
        });
      } else {
        await apiClient.updateCatalogItem(id, {
          name: name.trim(),
          price: parsedPrice,
          currency: currency.trim() || 'USD',
          unit: unit.trim() || 'each',
          stockQuantity: itemType === 'Stock' ? parsedStock : undefined,
        });
      }
      router.back();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [isNew, id, name, itemType, price, currency, unit, stockQuantity, router]);

  const toggleActive = useCallback(async () => {
    if (!existing) return;
    setTogglingActive(true);
    setSaveError(null);
    try {
      const updated = await apiClient.updateCatalogItem(existing.id, { active: !existing.active });
      setExisting(updated);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setTogglingActive(false);
    }
  }, [existing]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: isNew ? 'Add catalog item' : 'Edit catalog item' }} />
      {loading && <ActivityIndicator style={styles.loading} />}
      {loadError && <Text style={styles.error}>{loadError}</Text>}
      {!loading && !loadError && (
        <>
          <Text style={styles.label}>Name</Text>
          <TextInput style={inputStyle} placeholder="e.g. Premium Widget" value={name} onChangeText={setName} />

          <Text style={styles.label}>Item type</Text>
          <View style={styles.typeRow} lightColor="transparent" darkColor="transparent">
            {CATALOG_ITEM_TYPES.map((type) => {
              const active = type === itemType;
              return (
                <Pressable
                  key={type}
                  disabled={!isNew}
                  onPress={() => setItemType(type)}
                  style={[styles.typeChip, active && styles.typeChipActive, !isNew && styles.typeChipDisabled]}
                >
                  <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{CATALOG_ITEM_TYPE_LABELS[type]}</Text>
                </Pressable>
              );
            })}
          </View>
          {!isNew && <Text style={styles.hint}>Item type can't be changed after creation.</Text>}

          <Text style={styles.label}>Price</Text>
          <TextInput style={inputStyle} placeholder="0.00" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />

          <Text style={styles.label}>Currency</Text>
          <TextInput style={inputStyle} placeholder="USD" value={currency} onChangeText={setCurrency} autoCapitalize="characters" />

          <Text style={styles.label}>Unit</Text>
          <TextInput style={inputStyle} placeholder="each" value={unit} onChangeText={setUnit} />

          {itemType === 'Stock' && (
            <>
              <Text style={styles.label}>Stock quantity</Text>
              <TextInput style={inputStyle} placeholder="0" value={stockQuantity} onChangeText={setStockQuantity} keyboardType="number-pad" />
            </>
          )}

          {saveError && <Text style={styles.error}>{saveError}</Text>}

          <Pressable style={[styles.button, saving && styles.buttonDisabled]} disabled={saving} onPress={save}>
            <Text style={styles.buttonText}>{saving ? 'Saving…' : isNew ? 'Add item' : 'Save changes'}</Text>
          </Pressable>

          {!isNew && existing && (
            <Pressable
              style={[styles.secondaryButton, existing.active ? styles.deactivateButton : styles.reactivateButton]}
              disabled={togglingActive}
              onPress={toggleActive}
            >
              <Text style={[styles.secondaryButtonText, existing.active ? styles.deactivateText : styles.reactivateText]}>
                {togglingActive ? 'Updating…' : existing.active ? 'Deactivate item' : 'Reactivate item'}
              </Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 32 },
  loading: { marginTop: 40 },
  error: { color: '#c0392b', marginTop: 8, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', opacity: 0.7, marginTop: 14, marginBottom: 6 },
  hint: { fontSize: 12, opacity: 0.5, marginTop: -2, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', alignItems: 'center' },
  typeChipActive: { backgroundColor: '#007aff', borderColor: '#007aff' },
  typeChipDisabled: { opacity: 0.5 },
  typeChipText: { fontSize: 13, fontWeight: '600', opacity: 0.7 },
  typeChipTextActive: { color: '#fff', opacity: 1 },
  button: { backgroundColor: '#007aff', paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  secondaryButton: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 12, borderWidth: 1 },
  deactivateButton: { borderColor: '#c0392b' },
  reactivateButton: { borderColor: '#2e7d32' },
  secondaryButtonText: { fontWeight: '600' },
  deactivateText: { color: '#c0392b' },
  reactivateText: { color: '#2e7d32' },
});
