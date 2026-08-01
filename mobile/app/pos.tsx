import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { apiClient, CatalogItem, Customer, PosPaymentMethod } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { formatMoney } from '@/src/catalog/catalogItemType';
import { semanticColors, spacing, typography } from '@/constants/theme';
import { downloadAndShareDocument } from '@/src/documents/downloadAndShare';
import { useIsOnline } from '@/src/offline/networkStatus';
import { useToast } from '@/src/ui/ToastContext';

const PAYMENT_METHODS: readonly PosPaymentMethod[] = ['Cash', 'EcoCash', 'Bank', 'Other'];

type SaleType = 'sale' | 'quotation';
const SALE_TYPES: readonly { value: SaleType; label: string }[] = [
  { value: 'sale', label: 'Cash Sale' },
  { value: 'quotation', label: 'Quotation' },
];

interface CartLine {
  item: CatalogItem;
  quantity: number;
}

interface CompletionResult {
  kind: SaleType;
  orderId: string;
  totalAmount: number;
  currency: string;
  paymentReference?: string;
  customerName: string | null;
  customerWhatsAppNumber: string;
  amountTendered?: number | null;
  changeDue?: number | null;
}

function useInputStyle() {
  const colorScheme = useColorScheme();
  return [styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight];
}

function ItemPickerRow({ item, onAdd }: { item: CatalogItem; onAdd: () => void }) {
  const outOfStock = item.itemType === 'Stock' && (item.stockQuantity ?? 0) <= 0;
  return (
    <Pressable
      onPress={outOfStock ? undefined : onAdd}
      disabled={outOfStock}
      style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed, outOfStock && styles.pickerRowDisabled]}
    >
      <Card style={styles.pickerRowInner}>
        <View style={styles.pickerRowText} lightColor="transparent" darkColor="transparent">
          <Text style={styles.pickerName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.pickerMeta}>
            {formatMoney(item.price, item.currency)} / {item.unit}
            {item.itemType === 'Stock' ? ` · ${item.stockQuantity ?? 0} in stock` : ''}
          </Text>
        </View>
        <Text style={styles.pickerAdd}>{outOfStock ? 'Out of stock' : '+ Add'}</Text>
      </Card>
    </Pressable>
  );
}

function CustomerResultRow({ customer, onSelect }: { customer: Customer; onSelect: () => void }) {
  return (
    <Pressable onPress={onSelect} style={({ pressed }) => [styles.customerResultRow, pressed && styles.pickerRowPressed]}>
      <Text style={styles.customerResultName} numberOfLines={1}>
        {customer.name ?? 'Unnamed customer'}
      </Text>
      <Text style={styles.customerResultMeta}>
        {customer.whatsAppNumber} · {customer.orderCount} previous sale{customer.orderCount === 1 ? '' : 's'}
      </Text>
    </Pressable>
  );
}

// Two separate fields (name, phone) rather than one combined textbox. A new customer needs a
// phone number (it's Customer.WhatsAppNumber, the unique identity field) — name alone can't be
// saved. Both blank means an anonymous walk-in sale.
function resolveCustomerFields(nameRaw: string, phoneRaw: string): { phone?: string; name?: string; error?: string } {
  const name = nameRaw.trim();
  const phone = phoneRaw.trim().replace(/[\s-]/g, '');
  if (!name && !phone) return {};

  if (!phone) {
    return { error: 'Add a phone number to save a new customer, e.g. 0777123456 — or clear the name field for an anonymous walk-in sale.' };
  }

  return { phone, name: name || undefined };
}

function CartRow({ line, onIncrement, onDecrement, onRemove }: { line: CartLine; onIncrement: () => void; onDecrement: () => void; onRemove: () => void }) {
  return (
    <View style={styles.cartRow} lightColor="transparent" darkColor="transparent">
      <View style={styles.cartRowText} lightColor="transparent" darkColor="transparent">
        <Text style={styles.cartName} numberOfLines={1}>
          {line.item.name}
        </Text>
        <Text style={styles.cartSubtotal}>{formatMoney(line.item.price * line.quantity, line.item.currency)}</Text>
      </View>
      <View style={styles.stepper} lightColor="transparent" darkColor="transparent">
        <Pressable style={styles.stepperButton} onPress={onDecrement}>
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{line.quantity}</Text>
        <Pressable style={styles.stepperButton} onPress={onIncrement}>
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>
      <Pressable style={styles.removeButton} onPress={onRemove}>
        <Text style={styles.removeButtonText}>Remove</Text>
      </Pressable>
    </View>
  );
}

export default function PosScreen() {
  const router = useRouter();
  const inputStyle = useInputStyle();
  const isOnline = useIsOnline();
  const { show: showToast } = useToast();

  const [saleType, setSaleType] = useState<SaleType>('sale');
  const [vatRate, setVatRate] = useState(0);
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('Cash');
  const [amountTendered, setAmountTendered] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [result, setResult] = useState<CompletionResult | null>(null);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .getCatalog()
      .then((data) => setItems(data))
      .catch((err: Error) => setLoadError(err.message));
    apiClient
      .getBusiness()
      .then((business) => setVatRate(business.vatRate))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCustomer) return;
    // Search by phone when there's a usable phone fragment (a stronger, unique signal), otherwise
    // fall back to name — the backend matches a single term against either field.
    const term = customerPhone.trim().length >= 3 ? customerPhone.trim() : customerName.trim();
    if (term.length < 2) {
      setCustomerResults([]);
      return;
    }
    setSearchingCustomers(true);
    const handle = setTimeout(() => {
      apiClient
        .getCustomers(term)
        .then(setCustomerResults)
        .catch(() => setCustomerResults([]))
        .finally(() => setSearchingCustomers(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [customerName, customerPhone, selectedCustomer]);

  const selectCustomer = useCallback((customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerResults([]);
  }, []);

  const clearCustomer = useCallback(() => {
    setSelectedCustomer(null);
  }, []);

  const currencies = useMemo(() => {
    const set = new Set((items ?? []).filter((item) => item.active).map((item) => item.currency));
    return Array.from(set).sort();
  }, [items]);

  useEffect(() => {
    if (selectedCurrency === null && currencies.length > 0) {
      setSelectedCurrency(currencies[0]);
    }
  }, [currencies, selectedCurrency]);

  const availableItems = useMemo(() => {
    const activeItems = (items ?? []).filter((item) => item.active && (!selectedCurrency || item.currency === selectedCurrency));
    const term = search.trim().toLowerCase();
    if (!term) return activeItems;
    return activeItems.filter((item) => item.name.toLowerCase().includes(term));
  }, [items, search, selectedCurrency]);

  const cartLines = Object.values(cart);
  const total = cartLines.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const vatAmount = Math.round(total * vatRate * 100) / 100;
  const grandTotal = total + vatAmount;
  const currency = cartLines[0]?.item.currency ?? 'USD';
  const mixedCurrency = cartLines.some((line) => line.item.currency !== currency);

  const addItem = useCallback((item: CatalogItem) => {
    setResult(null);
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

  const removeItem = useCallback((itemId: string) => {
    setCart((prev) => {
      const { [itemId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const parsedTendered = amountTendered.trim() === '' ? null : Number(amountTendered);
  const tenderedValue = parsedTendered !== null && Number.isFinite(parsedTendered) ? parsedTendered : null;
  const showCashTender = saleType === 'sale' && paymentMethod === 'Cash';

  const completeSale = useCallback(async () => {
    setSaveError(null);
    if (cartLines.length === 0) {
      setSaveError('Add at least one item to the cart.');
      return;
    }
    if (mixedCurrency) {
      setSaveError('All items in a sale must use the same currency.');
      return;
    }
    if (showCashTender && tenderedValue !== null && tenderedValue < grandTotal) {
      setSaveError(`Amount tendered is less than the total (${formatMoney(grandTotal, currency)}).`);
      return;
    }

    let customer: { id?: string; whatsAppNumber?: string; name?: string } | undefined;
    if (selectedCustomer) {
      customer = { id: selectedCustomer.id };
    } else {
      const resolved = resolveCustomerFields(customerName, customerPhone);
      if (resolved.error) {
        setSaveError(resolved.error);
        return;
      }
      customer = resolved.phone ? { whatsAppNumber: resolved.phone, name: resolved.name } : undefined;
    }

    const lineItems = cartLines.map((line) => ({ catalogItemId: line.item.id, quantity: line.quantity }));

    setSaving(true);
    try {
      if (saleType === 'quotation') {
        const quotation = await apiClient.createQuotation(lineItems, customer);
        setResult({
          kind: 'quotation',
          orderId: quotation.orderId,
          totalAmount: quotation.totalAmount,
          currency: quotation.currency,
          customerName: quotation.customerName,
          customerWhatsAppNumber: quotation.customerWhatsAppNumber,
        });
      } else {
        const sale = await apiClient.recordPosSale(lineItems, paymentMethod, customer, showCashTender && tenderedValue !== null ? tenderedValue : undefined);
        setResult({
          kind: 'sale',
          orderId: sale.orderId,
          totalAmount: sale.totalAmount,
          currency: sale.currency,
          paymentReference: sale.paymentReference,
          customerName: sale.customerName,
          customerWhatsAppNumber: sale.customerWhatsAppNumber,
          amountTendered: sale.amountTendered,
          changeDue: sale.changeDue,
        });
      }
      setCart({});
      setSelectedCustomer(null);
      setCustomerName('');
      setCustomerPhone('');
      setAmountTendered('');
      showToast(saleType === 'quotation' ? 'Quotation created.' : 'Sale completed.', 'success');
      apiClient.getCatalog().then(setItems).catch(() => {});
    } catch (err) {
      const message = (err as Error).message;
      setSaveError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  }, [
    cartLines,
    mixedCurrency,
    paymentMethod,
    selectedCustomer,
    customerName,
    customerPhone,
    saleType,
    showCashTender,
    tenderedValue,
    grandTotal,
    currency,
    showToast,
  ]);

  const downloadReceipt = useCallback(async () => {
    if (!result) return;
    setReceiptError(null);
    setDownloadingReceipt(true);
    try {
      await downloadAndShareDocument(`/api/orders/${result.orderId}/receipt`, `receipt-${result.orderId.slice(0, 8)}.pdf`);
    } catch (err) {
      setReceiptError((err as Error).message);
    } finally {
      setDownloadingReceipt(false);
    }
  }, [result]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'New sale' }} />

      {result && (
        <View style={styles.successBanner} lightColor="#e8f5e9" darkColor="rgba(46,125,50,0.2)">
          <Text style={styles.successTitle}>
            {result.kind === 'quotation' ? 'Quotation created' : 'Sale recorded'} — {formatMoney(result.totalAmount, result.currency)}
          </Text>
          <Text style={styles.successMeta}>
            {result.kind === 'quotation' ? 'For' : 'Sold to'}: {result.customerName ?? result.customerWhatsAppNumber}
            {result.paymentReference ? ` · Reference: ${result.paymentReference}` : ''}
          </Text>
          {result.amountTendered != null && (
            <Text style={styles.successMeta}>
              Tendered: {formatMoney(result.amountTendered, result.currency)} · Change due: {formatMoney(result.changeDue ?? 0, result.currency)}
            </Text>
          )}
          {receiptError && <Text style={styles.error}>{receiptError}</Text>}
          {result.kind === 'sale' && (
            <Button
              label={downloadingReceipt ? 'Preparing…' : 'Download receipt'}
              variant="secondary"
              style={styles.receiptButton}
              disabled={downloadingReceipt}
              onPress={downloadReceipt}
            />
          )}
          <Button label="Done" variant="success" style={styles.successDismiss} onPress={() => router.back()} />
        </View>
      )}

      {!result && (
        <>
          <View style={styles.saleTypeRow} lightColor="transparent" darkColor="transparent">
            {SALE_TYPES.map((type) => (
              <Chip key={type.value} label={type.label} active={type.value === saleType} onPress={() => setSaleType(type.value)} style={styles.saleTypeChip} />
            ))}
          </View>

          {currencies.length > 1 && (
            <View style={styles.currencyRow} lightColor="transparent" darkColor="transparent">
              {currencies.map((cur) => (
                <Chip
                  key={cur}
                  label={cur}
                  active={cur === selectedCurrency}
                  disabled={cartLines.length > 0 && cur !== selectedCurrency}
                  onPress={() => setSelectedCurrency(cur)}
                />
              ))}
            </View>
          )}

          <TextInput style={inputStyle} placeholder="Search items…" value={search} onChangeText={setSearch} />

          {loadError && <Text style={styles.error}>Could not reach the API: {loadError}</Text>}
          {!loadError && items === null && <ActivityIndicator style={styles.loading} />}

          {!loadError && items !== null && (
            <FlatList
              style={styles.pickerList}
              data={availableItems}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <ItemPickerRow item={item} onAdd={() => addItem(item)} />}
              ListEmptyComponent={<Text style={styles.empty}>No matching active items.</Text>}
            />
          )}

          <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

          <ScrollView style={styles.cartSection}>
            <Text style={styles.sectionTitle}>Cart ({cartLines.length})</Text>
            {cartLines.length === 0 && <Text style={styles.empty}>No items added yet.</Text>}
            {cartLines.map((line) => (
              <CartRow
                key={line.item.id}
                line={line}
                onIncrement={() => incrementItem(line.item.id)}
                onDecrement={() => decrementItem(line.item.id)}
                onRemove={() => removeItem(line.item.id)}
              />
            ))}

            {cartLines.length > 0 && (
              <>
                {vatRate > 0 && (
                  <View style={styles.subtotalRow} lightColor="transparent" darkColor="transparent">
                    <Text style={styles.subtotalLabel}>Subtotal</Text>
                    <Text style={styles.subtotalValue}>{formatMoney(total, currency)}</Text>
                  </View>
                )}
                {vatRate > 0 && (
                  <View style={styles.subtotalRow} lightColor="transparent" darkColor="transparent">
                    <Text style={styles.subtotalLabel}>VAT ({(vatRate * 100).toFixed(vatRate * 100 % 1 === 0 ? 0 : 2)}%)</Text>
                    <Text style={styles.subtotalValue}>{formatMoney(vatAmount, currency)}</Text>
                  </View>
                )}
                <View style={styles.totalRow} lightColor="transparent" darkColor="transparent">
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>{formatMoney(grandTotal, currency)}</Text>
                </View>
              </>
            )}

            {saleType === 'sale' && (
              <>
                <Text style={styles.label}>Payment method</Text>
                <View style={styles.paymentRow} lightColor="transparent" darkColor="transparent">
                  {PAYMENT_METHODS.map((method) => (
                    <Chip key={method} label={method} active={method === paymentMethod} onPress={() => setPaymentMethod(method)} />
                  ))}
                </View>
              </>
            )}

            {showCashTender && (
              <>
                <Text style={styles.label}>Amount tendered (optional)</Text>
                <TextInput
                  style={inputStyle}
                  placeholder={`e.g. ${formatMoney(grandTotal, currency)}`}
                  value={amountTendered}
                  onChangeText={setAmountTendered}
                  keyboardType="decimal-pad"
                />
                {tenderedValue !== null && (
                  <Text style={[styles.tenderedHint, tenderedValue < grandTotal && styles.tenderedInsufficient]}>
                    {tenderedValue < grandTotal
                      ? `Insufficient — needs ${formatMoney(grandTotal - tenderedValue, currency)} more`
                      : `Change due: ${formatMoney(tenderedValue - grandTotal, currency)}`}
                  </Text>
                )}
              </>
            )}

            <Text style={styles.label}>Customer</Text>
            {selectedCustomer ? (
              <Card style={styles.selectedCustomerCard}>
                <View style={styles.selectedCustomerText} lightColor="transparent" darkColor="transparent">
                  <Text style={styles.selectedCustomerName} numberOfLines={1}>
                    {selectedCustomer.name ?? 'Unnamed customer'}
                  </Text>
                  <Text style={styles.selectedCustomerMeta}>
                    {selectedCustomer.whatsAppNumber} · {selectedCustomer.orderCount} previous sale{selectedCustomer.orderCount === 1 ? '' : 's'}
                  </Text>
                </View>
                <Button label="Change" style={styles.changeCustomerButton} onPress={clearCustomer} />
              </Card>
            ) : (
              <>
                <TextInput
                  style={inputStyle}
                  placeholder="Customer name (new or existing)"
                  value={customerName}
                  onChangeText={setCustomerName}
                />
                <TextInput
                  style={[inputStyle, styles.phoneInput]}
                  placeholder="Phone number"
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                  keyboardType="phone-pad"
                />
                <Text style={styles.hint}>
                  Leave both blank for an anonymous walk-in. Typing either field searches existing customers; saving a new customer requires a
                  phone number, e.g. 0777123456.
                </Text>
                {searchingCustomers && <ActivityIndicator style={styles.customerSearchLoading} />}
                {customerResults.length > 0 && (
                  <View style={styles.customerResults} lightColor="transparent" darkColor="transparent">
                    {customerResults.map((customer) => (
                      <CustomerResultRow key={customer.id} customer={customer} onSelect={() => selectCustomer(customer)} />
                    ))}
                  </View>
                )}
              </>
            )}

            {saveError && <Text style={styles.error}>{saveError}</Text>}
            {!isOnline && (
              <Text style={styles.error}>You're offline — connect to complete this {saleType === 'quotation' ? 'quotation' : 'sale'}.</Text>
            )}

            <Button
              label={saving ? 'Saving…' : saleType === 'quotation' ? 'Create Quotation' : 'Complete sale'}
              style={styles.completeButton}
              disabled={saving || cartLines.length === 0 || !isOnline}
              onPress={completeSale}
            />
          </ScrollView>
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
  saleTypeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  saleTypeChip: { flex: 1, alignItems: 'center' },
  currencyRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tenderedHint: { fontSize: 13, fontWeight: '600', color: semanticColors.success, marginTop: 6 },
  tenderedInsufficient: { color: semanticColors.danger },
  label: { fontSize: 13, fontWeight: '600', opacity: 0.7, marginTop: spacing.lg, marginBottom: spacing.xs + 2 },
  sectionTitle: { ...typography.bodyStrong, fontSize: 15, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
  pickerList: { maxHeight: 220, marginTop: 10 },
  pickerRow: { marginBottom: spacing.sm },
  pickerRowPressed: { opacity: 0.7 },
  pickerRowDisabled: { opacity: 0.5 },
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
  cartRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 },
  cartRowText: { flexShrink: 1 },
  cartName: { fontSize: 14, fontWeight: '600' },
  cartSubtotal: { fontSize: 13, opacity: 0.7, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperButton: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  stepperButtonText: { fontSize: 16, fontWeight: '700' },
  stepperValue: { fontSize: 14, fontWeight: '600', minWidth: 18, textAlign: 'center' },
  removeButton: { paddingHorizontal: 4 },
  removeButtonText: { fontSize: 12, color: semanticColors.danger, fontWeight: '600' },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  subtotalLabel: { fontSize: 13, opacity: 0.7 },
  subtotalValue: { fontSize: 13, opacity: 0.7 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ccc' },
  totalLabel: { fontSize: 15, fontWeight: '700' },
  totalValue: { fontSize: 17, fontWeight: '800' },
  paymentRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  hint: { fontSize: 12, opacity: 0.5, marginTop: 10, marginBottom: 6 },
  phoneInput: { marginTop: 8 },
  customerSearchLoading: { marginTop: 8 },
  customerResults: { marginTop: 8, gap: 8 },
  customerResultRow: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  customerResultName: { fontSize: 14, fontWeight: '600' },
  customerResultMeta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  selectedCustomerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  selectedCustomerText: { flexShrink: 1 },
  selectedCustomerName: { fontSize: 14, fontWeight: '700' },
  selectedCustomerMeta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  changeCustomerButton: { paddingHorizontal: 12, paddingVertical: 6 },
  completeButton: { marginTop: spacing.xl, marginBottom: spacing.sm },
  successBanner: { borderRadius: 10, padding: 16, marginTop: 16 },
  successTitle: { fontSize: 16, fontWeight: '700' },
  successMeta: { fontSize: 13, opacity: 0.7, marginTop: 4 },
  successDismiss: { marginTop: 16 },
  receiptButton: { marginTop: 12 },
});
