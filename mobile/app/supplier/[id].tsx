import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Section } from '@/components/ui/Section';
import { apiClient, PurchaseOrderStatus, PurchaseOrderSummary, Supplier, SupplierCategory } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { colorFor, initialsFor } from '@/src/marketplace/avatar';
import { semanticColors, spacing } from '@/constants/theme';
import { formatMoney } from '@/src/common/format';
import { formatRelativeDate } from '@/src/orders/orderStatus';
import { useIsOnline } from '@/src/offline/networkStatus';
import { SUPPLIER_CATEGORIES, SUPPLIER_RATINGS } from '@/src/suppliers/supplierCategory';
import { useConfirm } from '@/src/ui/ConfirmContext';
import { useToast } from '@/src/ui/ToastContext';

const PO_STATUS_COLORS: Record<PurchaseOrderStatus, string> = {
  Draft: semanticColors.neutral,
  Ordered: semanticColors.warning,
  Received: semanticColors.success,
  Cancelled: semanticColors.danger,
};

function useInputStyle() {
  const colorScheme = useColorScheme();
  return [styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight];
}

export default function SupplierScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const inputStyle = useInputStyle();
  const colorScheme = useColorScheme();
  const isOnline = useIsOnline();
  const isNew = id === 'new';
  const { confirm } = useConfirm();
  const { show: showToast } = useToast();

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [existing, setExisting] = useState<Supplier | null>(null);
  const [supplierPos, setSupplierPos] = useState<PurchaseOrderSummary[] | null>(null);

  const [name, setName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<SupplierCategory | null>(null);
  const [rating, setRating] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [togglingActive, setTogglingActive] = useState(false);

  useEffect(() => {
    if (isNew) return;
    Promise.all([apiClient.getSuppliers(), apiClient.getPurchaseOrders()])
      .then(([suppliers, allPurchaseOrders]) => {
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
        setCategory(supplier.category);
        setRating(supplier.rating);
        setSupplierPos(
          allPurchaseOrders.filter((po) => po.supplierId === id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        );
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
          category: category ?? undefined,
          rating: rating ?? undefined,
        });
      } else {
        await apiClient.updateSupplier(id, {
          name: name.trim(),
          contactPhone: contactPhone.trim() || undefined,
          email: email.trim() || undefined,
          notes: notes.trim() || undefined,
          category: category ?? undefined,
          rating: rating ?? undefined,
        });
      }
      showToast(isNew ? 'Supplier added.' : 'Supplier saved.', 'success');
      router.back();
    } catch (err) {
      const message = (err as Error).message;
      setSaveError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  }, [isNew, id, name, contactPhone, email, notes, category, rating, router, showToast]);

  const toggleActive = useCallback(async () => {
    if (!existing) return;
    setTogglingActive(true);
    setSaveError(null);
    try {
      const updated = await apiClient.updateSupplier(existing.id, { active: !existing.active });
      setExisting(updated);
      showToast(updated.active ? 'Supplier reactivated.' : 'Supplier deactivated.', 'success');
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
        title: 'Deactivate this supplier?',
        message: `${existing.name} won't appear when creating new purchase orders until reactivated.`,
        confirmLabel: 'Deactivate',
        destructive: true,
      });
      if (!ok) return;
    }
    toggleActive();
  }, [existing, confirm, toggleActive]);

  const totalSpend = supplierPos?.reduce((sum, po) => sum + po.amountPaid, 0) ?? 0;
  const spendCurrency = supplierPos?.[0]?.currency ?? 'USD';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: isNew ? 'Add supplier' : 'Edit supplier' }} />
      {loading && <ActivityIndicator style={styles.loading} />}
      {loadError && <Text style={styles.error}>{loadError}</Text>}
      {!loading && !loadError && (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {!isNew && existing && (
            <View style={styles.profileHeader} lightColor="transparent" darkColor="transparent">
              <View style={[styles.avatar, { backgroundColor: colorFor(existing.name) }]}>
                <Text style={styles.avatarText}>{initialsFor(existing.name)}</Text>
              </View>
              <View style={styles.profileHeaderText} lightColor="transparent" darkColor="transparent">
                <Text style={styles.profileName} numberOfLines={1}>
                  {existing.name}
                </Text>
                <Badge label={existing.active ? 'Active' : 'Inactive'} color={existing.active ? semanticColors.success : semanticColors.neutral} />
              </View>
            </View>
          )}

          {!isNew && supplierPos && supplierPos.length > 0 && (
            <Section title="Purchase history">
              <View style={styles.totalSpendRow} lightColor="transparent" darkColor="transparent">
                <Text style={styles.totalSpendLabel}>Total spend</Text>
                <Text style={styles.totalSpendValue}>{formatMoney(totalSpend, spendCurrency)}</Text>
              </View>
              {supplierPos.slice(0, 5).map((po, index) => (
                <View
                  key={po.id}
                  style={[styles.poRow, index === Math.min(supplierPos.length, 5) - 1 && styles.poRowLast]}
                  lightColor="transparent"
                  darkColor="transparent"
                >
                  <View style={styles.poRowText} lightColor="transparent" darkColor="transparent">
                    <Text style={styles.poAmount}>{formatMoney(po.totalAmount, po.currency)}</Text>
                    <Text style={[styles.poDate, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
                      {formatRelativeDate(po.createdAt)}
                    </Text>
                  </View>
                  <Badge label={po.status} color={PO_STATUS_COLORS[po.status]} />
                </View>
              ))}
            </Section>
          )}

          <Section title="Supplier details">
            <Text style={styles.label}>Name</Text>
            <TextInput style={inputStyle} placeholder="e.g. Zimbuild Hardware Wholesalers" value={name} onChangeText={setName} />

            <Text style={styles.label}>Contact phone</Text>
            <TextInput style={inputStyle} placeholder="e.g. 26377xxxxxxx" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />

            <Text style={styles.label}>Email</Text>
            <TextInput style={inputStyle} placeholder="e.g. orders@supplier.com" value={email} onChangeText={setEmail} keyboardType="email-address" />

            <Text style={styles.label}>Notes</Text>
            <TextInput style={inputStyle} placeholder="Optional" value={notes} onChangeText={setNotes} />

            <Text style={styles.label}>Category</Text>
            <View style={styles.chipRow} lightColor="transparent" darkColor="transparent">
              {SUPPLIER_CATEGORIES.map((c) => (
                <Chip key={c} label={c} active={c === category} onPress={() => setCategory(c === category ? null : c)} />
              ))}
            </View>

            <Text style={styles.label}>Rating</Text>
            <View style={styles.chipRow} lightColor="transparent" darkColor="transparent">
              {SUPPLIER_RATINGS.map((r) => (
                <Chip key={r} label={'★'.repeat(r)} active={r === rating} onPress={() => setRating(r === rating ? null : r)} />
              ))}
            </View>
          </Section>

          {saveError && <Text style={styles.error}>{saveError}</Text>}
          {!isOnline && <Text style={styles.error}>You're offline — connect to save.</Text>}

          <Button label={saving ? 'Saving…' : isNew ? 'Add supplier' : 'Save changes'} onPress={save} disabled={saving || !isOnline} />

          {!isNew && existing && (
            <View style={styles.secondaryButtonWrap} lightColor="transparent" darkColor="transparent">
              <Button
                label={togglingActive ? 'Updating…' : existing.active ? 'Deactivate supplier' : 'Reactivate supplier'}
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
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  profileHeaderText: { flex: 1, gap: 6 },
  profileName: { fontSize: 19, fontWeight: '700' },
  totalSpendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  totalSpendLabel: { fontSize: 12, opacity: 0.6, fontWeight: '600', textTransform: 'uppercase' },
  totalSpendValue: { fontSize: 18, fontWeight: '800' },
  poRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.15)',
  },
  poRowLast: { paddingBottom: 0 },
  poRowText: { flex: 1, marginRight: spacing.sm },
  poAmount: { fontSize: 14, fontWeight: '600' },
  poDate: { fontSize: 12, marginTop: 2 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  label: { fontSize: 13, fontWeight: '600', opacity: 0.7, marginTop: spacing.md, marginBottom: spacing.xs + 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
  },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
  secondaryButtonWrap: { marginTop: spacing.sm },
});
