import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { apiClient, Supplier } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { useIsOnline } from '@/src/offline/networkStatus';

function useInputStyle() {
  const colorScheme = useColorScheme();
  return [styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight];
}

export default function SupplierScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const inputStyle = useInputStyle();
  const isOnline = useIsOnline();
  const isNew = id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [existing, setExisting] = useState<Supplier | null>(null);

  const [name, setName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);

  useEffect(() => {
    if (isNew) return;
    apiClient
      .getSuppliers()
      .then((suppliers) => {
        const supplier = suppliers.find((s) => s.id === id);
        if (!supplier) {
          setLoadError('Supplier not found.');
          return;
        }
        setExisting(supplier);
        setName(supplier.name);
        setContactPhone(supplier.contactPhone ?? '');
        setEmail(supplier.email ?? '');
        setNotes(supplier.notes ?? '');
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

    setSaving(true);
    try {
      if (isNew) {
        await apiClient.createSupplier({
          name: name.trim(),
          contactPhone: contactPhone.trim() || undefined,
          email: email.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      } else {
        await apiClient.updateSupplier(id, {
          name: name.trim(),
          contactPhone: contactPhone.trim() || undefined,
          email: email.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      }
      router.back();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [isNew, id, name, contactPhone, email, notes, router]);

  const toggleActive = useCallback(async () => {
    if (!existing) return;
    setTogglingActive(true);
    setSaveError(null);
    try {
      const updated = await apiClient.updateSupplier(existing.id, { active: !existing.active });
      setExisting(updated);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setTogglingActive(false);
    }
  }, [existing]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: isNew ? 'Add supplier' : 'Edit supplier' }} />
      {loading && <ActivityIndicator style={styles.loading} />}
      {loadError && <Text style={styles.error}>{loadError}</Text>}
      {!loading && !loadError && (
        <>
          <Text style={styles.label}>Name</Text>
          <TextInput style={inputStyle} placeholder="e.g. Zimbuild Hardware Wholesalers" value={name} onChangeText={setName} />

          <Text style={styles.label}>Contact phone</Text>
          <TextInput style={inputStyle} placeholder="e.g. 26377xxxxxxx" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />

          <Text style={styles.label}>Email</Text>
          <TextInput style={inputStyle} placeholder="e.g. orders@supplier.com" value={email} onChangeText={setEmail} keyboardType="email-address" />

          <Text style={styles.label}>Notes</Text>
          <TextInput style={inputStyle} placeholder="Optional" value={notes} onChangeText={setNotes} />

          {saveError && <Text style={styles.error}>{saveError}</Text>}
          {!isOnline && <Text style={styles.error}>You're offline — connect to save.</Text>}

          <Pressable style={[styles.button, (saving || !isOnline) && styles.buttonDisabled]} disabled={saving || !isOnline} onPress={save}>
            <Text style={styles.buttonText}>{saving ? 'Saving…' : isNew ? 'Add supplier' : 'Save changes'}</Text>
          </Pressable>

          {!isNew && existing && (
            <Pressable
              style={[styles.secondaryButton, existing.active ? styles.deactivateButton : styles.reactivateButton, !isOnline && styles.buttonDisabled]}
              disabled={togglingActive || !isOnline}
              onPress={toggleActive}
            >
              <Text style={[styles.secondaryButtonText, existing.active ? styles.deactivateText : styles.reactivateText]}>
                {togglingActive ? 'Updating…' : existing.active ? 'Deactivate supplier' : 'Reactivate supplier'}
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
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
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
