import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Section } from '@/components/ui/Section';
import { apiClient, CatalogItem, CatalogItemType } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { radius, semanticColors, spacing } from '@/constants/theme';
import { CATALOG_ITEM_TYPE_LABELS, CATALOG_ITEM_TYPES } from '@/src/catalog/catalogItemType';
import { useIsOnline } from '@/src/offline/networkStatus';
import { useConfirm } from '@/src/ui/ConfirmContext';
import { useToast } from '@/src/ui/ToastContext';

function useInputStyle() {
  const colorScheme = useColorScheme();
  return [styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight];
}

export default function CatalogItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const inputStyle = useInputStyle();
  const isOnline = useIsOnline();
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const isNew = id === 'new';
  const { confirm } = useConfirm();
  const { show: showToast } = useToast();

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [existing, setExisting] = useState<CatalogItem | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [itemType, setItemType] = useState<CatalogItemType>('Stock');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [unit, setUnit] = useState('each');
  const [stockQuantity, setStockQuantity] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('5');

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
        setCode(item.code ?? '');
        setItemType(item.itemType);
        setPrice(item.price.toString());
        setCurrency(item.currency);
        setUnit(item.unit);
        setStockQuantity(item.stockQuantity?.toString() ?? '');
        setLowStockThreshold(item.lowStockThreshold.toString());
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
    let parsedThreshold: number | undefined;
    if (itemType === 'Stock') {
      parsedStock = stockQuantity.trim() === '' ? 0 : Number(stockQuantity);
      if (!Number.isFinite(parsedStock) || parsedStock < 0 || !Number.isInteger(parsedStock)) {
        setSaveError('Stock quantity must be a valid non-negative whole number.');
        return;
      }
      parsedThreshold = lowStockThreshold.trim() === '' ? 5 : Number(lowStockThreshold);
      if (!Number.isFinite(parsedThreshold) || parsedThreshold < 0 || !Number.isInteger(parsedThreshold)) {
        setSaveError('Low stock threshold must be a valid non-negative whole number.');
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
          code: code.trim() || null,
          lowStockThreshold: parsedThreshold,
        });
      } else {
        await apiClient.updateCatalogItem(id, {
          name: name.trim(),
          price: parsedPrice,
          currency: currency.trim() || 'USD',
          unit: unit.trim() || 'each',
          stockQuantity: itemType === 'Stock' ? parsedStock : undefined,
          code: code.trim() || null,
          lowStockThreshold: itemType === 'Stock' ? parsedThreshold : undefined,
        });
      }
      showToast(isNew ? 'Item added.' : 'Item saved.', 'success');
      router.back();
    } catch (err) {
      const message = (err as Error).message;
      setSaveError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  }, [isNew, id, name, code, itemType, price, currency, unit, stockQuantity, lowStockThreshold, router, showToast]);

  const toggleActive = useCallback(async () => {
    if (!existing) return;
    setTogglingActive(true);
    setSaveError(null);
    try {
      const updated = await apiClient.updateCatalogItem(existing.id, { active: !existing.active });
      setExisting(updated);
      showToast(updated.active ? 'Item reactivated.' : 'Item deactivated.', 'success');
    } catch (err) {
      const message = (err as Error).message;
      setSaveError(message);
      showToast(message, 'error');
    } finally {
      setTogglingActive(false);
    }
  }, [existing, showToast]);

  const handleToggleActive = useCallback(async () => {
    if (!existing) return;
    if (existing.active) {
      const ok = await confirm({
        title: 'Deactivate this item?',
        message: `${existing.name} won't be visible in the catalog until reactivated.`,
        confirmLabel: 'Deactivate',
        destructive: true,
      });
      if (!ok) return;
    }
    toggleActive();
  }, [existing, confirm, toggleActive]);

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
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {!isNew && existing && (
            <Section title="Photo">
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
                    style={[styles.photoButton, { borderColor: tint }, (imageUploading || !isOnline) && styles.buttonDisabled]}
                    disabled={imageUploading || !isOnline}
                    onPress={() => pickImage('library')}
                  >
                    <Text style={[styles.photoButtonText, { color: tint }]}>{imageUploading ? 'Uploading…' : 'Choose photo'}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.photoButton, { borderColor: tint }, (imageUploading || !isOnline) && styles.buttonDisabled]}
                    disabled={imageUploading || !isOnline}
                    onPress={() => pickImage('camera')}
                  >
                    <Text style={[styles.photoButtonText, { color: tint }]}>Take photo</Text>
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
            </Section>
          )}

          <Section title="Item details">
            <Text style={styles.label}>Name</Text>
            <TextInput style={inputStyle} placeholder="e.g. Premium Widget" value={name} onChangeText={setName} />

            <Text style={styles.label}>Code (optional)</Text>
            <TextInput style={inputStyle} placeholder="e.g. SKU-1024" value={code} onChangeText={setCode} autoCapitalize="characters" />

            <Text style={styles.label}>Item type</Text>
            <View style={styles.typeRow} lightColor="transparent" darkColor="transparent">
              {CATALOG_ITEM_TYPES.map((type) => (
                <Chip
                  key={type}
                  label={CATALOG_ITEM_TYPE_LABELS[type]}
                  active={type === itemType}
                  disabled={!isNew}
                  onPress={() => setItemType(type)}
                  style={styles.typeChip}
                />
              ))}
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

                <Text style={styles.label}>Low stock threshold</Text>
                <TextInput style={inputStyle} placeholder="5" value={lowStockThreshold} onChangeText={setLowStockThreshold} keyboardType="number-pad" />
              </>
            )}
          </Section>

          {saveError && <Text style={styles.error}>{saveError}</Text>}
          {!isOnline && <Text style={styles.error}>You're offline — connect to save.</Text>}

          <Button label={saving ? 'Saving…' : isNew ? 'Add item' : 'Save changes'} onPress={save} disabled={saving || !isOnline} />

          {!isNew && existing && (
            <View style={styles.secondaryButtonWrap} lightColor="transparent" darkColor="transparent">
              <Button
                label={togglingActive ? 'Updating…' : existing.active ? 'Deactivate item' : 'Reactivate item'}
                variant={existing.active ? 'destructive' : 'secondary'}
                onPress={handleToggleActive}
                disabled={togglingActive || !isOnline}
              />
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  loading: { marginTop: 40 },
  error: { color: semanticColors.danger, marginTop: 8, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', opacity: 0.7, marginTop: spacing.md, marginBottom: spacing.xs + 2 },
  hint: { fontSize: 12, opacity: 0.5, marginTop: -2, marginBottom: 4 },
  photoRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  photoPreview: { width: 72, height: 72, borderRadius: radius.md },
  photoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: { fontSize: 11, opacity: 0.5, textAlign: 'center' },
  photoActions: { gap: spacing.xs + 2 },
  photoButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, borderWidth: 1, alignSelf: 'flex-start' },
  photoButtonText: { fontWeight: '600', fontSize: 13 },
  removePhotoText: { color: semanticColors.danger, fontWeight: '600', fontSize: 12 },
  buttonDisabled: { opacity: 0.6 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
  },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeChip: { flex: 1 },
  secondaryButtonWrap: { marginTop: spacing.sm },
});
