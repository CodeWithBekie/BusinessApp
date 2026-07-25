import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, TextInput } from 'react-native';

import { apiClient, CatalogItem, CatalogItemType } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { CATALOG_ITEM_TYPE_LABELS, CATALOG_ITEM_TYPES } from '@/src/catalog/catalogItemType';
import { useIsOnline } from '@/src/offline/networkStatus';

function useInputStyle() {
  const colorScheme = useColorScheme();
  return [styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight];
}

export default function CatalogItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const inputStyle = useInputStyle();
  const isOnline = useIsOnline();
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
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

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

  const pickImage = useCallback(
    async (source: 'library' | 'camera') => {
      if (!existing) return;
      const permission =
        source === 'library'
          ? await ImagePicker.requestMediaLibraryPermissionsAsync()
          : await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setImageError('Permission was not granted.');
        return;
      }

      const result =
        source === 'library'
          ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.7 })
          : await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      setImageError(null);
      setImageUploading(true);
      try {
        const updated = await apiClient.uploadCatalogItemImage(existing.id, asset.uri, asset.mimeType ?? 'image/jpeg');
        setExisting(updated);
      } catch (err) {
        setImageError((err as Error).message);
      } finally {
        setImageUploading(false);
      }
    },
    [existing]
  );

  const removeImage = useCallback(async () => {
    if (!existing) return;
    setImageError(null);
    setImageUploading(true);
    try {
      const updated = await apiClient.removeCatalogItemImage(existing.id);
      setExisting(updated);
    } catch (err) {
      setImageError((err as Error).message);
    } finally {
      setImageUploading(false);
    }
  }, [existing]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: isNew ? 'Add catalog item' : 'Edit catalog item' }} />
      {loading && <ActivityIndicator style={styles.loading} />}
      {loadError && <Text style={styles.error}>{loadError}</Text>}
      {!loading && !loadError && (
        <>
          {!isNew && existing && (
            <>
              <Text style={styles.label}>Photo</Text>
              <View style={styles.photoRow} lightColor="transparent" darkColor="transparent">
                {existing.hasImage ? (
                  <Image source={{ uri: apiClient.getCatalogItemImageUrl(existing.id, existing.updatedAt) }} style={styles.photoPreview} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.photoPlaceholderText}>No photo</Text>
                  </View>
                )}
                <View style={styles.photoActions} lightColor="transparent" darkColor="transparent">
                  <Pressable
                    style={[styles.photoButton, (imageUploading || !isOnline) && styles.buttonDisabled]}
                    disabled={imageUploading || !isOnline}
                    onPress={() => pickImage('library')}
                  >
                    <Text style={styles.photoButtonText}>{imageUploading ? 'Uploading…' : 'Choose photo'}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.photoButton, (imageUploading || !isOnline) && styles.buttonDisabled]}
                    disabled={imageUploading || !isOnline}
                    onPress={() => pickImage('camera')}
                  >
                    <Text style={styles.photoButtonText}>Take photo</Text>
                  </Pressable>
                  {existing.hasImage && (
                    <Pressable disabled={imageUploading || !isOnline} onPress={removeImage}>
                      <Text style={[styles.removePhotoText, (imageUploading || !isOnline) && styles.buttonDisabled]}>Remove photo</Text>
                    </Pressable>
                  )}
                </View>
              </View>
              {imageError && <Text style={styles.error}>{imageError}</Text>}
              {!isOnline && <Text style={styles.hint}>You're offline — connect to change the photo.</Text>}
            </>
          )}

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
          {!isOnline && <Text style={styles.error}>You're offline — connect to save.</Text>}

          <Pressable style={[styles.button, (saving || !isOnline) && styles.buttonDisabled]} disabled={saving || !isOnline} onPress={save}>
            <Text style={styles.buttonText}>{saving ? 'Saving…' : isNew ? 'Add item' : 'Save changes'}</Text>
          </Pressable>

          {!isNew && existing && (
            <Pressable
              style={[styles.secondaryButton, existing.active ? styles.deactivateButton : styles.reactivateButton, !isOnline && styles.buttonDisabled]}
              disabled={togglingActive || !isOnline}
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
  photoRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  photoPreview: { width: 72, height: 72, borderRadius: 10 },
  photoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: { fontSize: 11, opacity: 0.5, textAlign: 'center' },
  photoActions: { gap: 6 },
  photoButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#007aff', alignSelf: 'flex-start' },
  photoButtonText: { color: '#007aff', fontWeight: '600', fontSize: 13 },
  removePhotoText: { color: '#c0392b', fontWeight: '600', fontSize: 12 },
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
