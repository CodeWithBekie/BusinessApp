import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import { createElement, useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput } from 'react-native';

import {
  apiClient,
  CashFlowResult,
  CashUpResult,
  CreateExpenseInput,
  ExpenseCategory,
  ExpenseSummary,
  GeneralLedgerResult,
  PosPaymentMethod,
  ProfitAndLossResult,
  SalesRange,
  SalesSummary,
  TrialBalanceResult,
} from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { formatMoney } from '@/src/common/format';
import { useCachedFetch } from '@/src/offline/useCachedFetch';
import { useIsOnline } from '@/src/offline/networkStatus';
import { useHasPermission } from '@/src/auth/permissions';

type Section = 'sales' | 'pnl' | 'cashup' | 'cashflow' | 'ledger' | 'expenses';

function SectionTabs({ value, onChange }: { value: Section; onChange: (value: Section) => void }) {
  const options: readonly { value: Section; label: string }[] = [
    { value: 'sales', label: 'Sales' },
    { value: 'pnl', label: 'P&L' },
    { value: 'cashup', label: 'Cash Up' },
    { value: 'cashflow', label: 'Cash Flow' },
    { value: 'ledger', label: 'Ledger' },
    { value: 'expenses', label: 'Expenses' },
  ];
  return (
    <View style={styles.sectionRow} lightColor="transparent" darkColor="transparent">
      {options.map((option) => (
        <Pressable
          key={option.value}
          onPress={() => onChange(option.value)}
          style={[styles.sectionChip, value === option.value && styles.sectionChipActive]}
        >
          <Text style={[styles.sectionChipText, value === option.value && styles.sectionChipTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

type FilterValue = SalesRange | 'custom';

const RANGES: readonly { value: SalesRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'all', label: 'All time' },
];

const CHART_HEIGHT = 120;

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

// Local date parts, not toISOString() — that converts to UTC and can shift the calendar day
// picked by the user when their local timezone is behind UTC around midnight.
function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Native calendar picker, cross-platform: an always-visible native <input type="date"> on web
// (fastest — no extra tap to open it), a tap-to-open native calendar/spinner dialog elsewhere.
function DateField({ label, value, onChange }: { label: string; value: Date | null; onChange: (date: Date) => void }) {
  const colorScheme = useColorScheme();
  const [pickerVisible, setPickerVisible] = useState(false);
  const textStyle = colorScheme === 'dark' ? styles.dateInputDark : styles.dateInputLight;

  if (Platform.OS === 'web') {
    // @react-native-community/datetimepicker has no web implementation (iOS/Android only) — it
    // silently renders nothing there. A native <input type="date"> gives the same fast,
    // zero-extra-tap calendar picker the browser already provides, with no extra dependency.
    return (
      <View style={styles.dateFieldFlex} lightColor="transparent" darkColor="transparent">
        {createElement('input', {
          type: 'date',
          value: value ? toDateKey(value) : '',
          onChange: (e: { target: { value: string } }) => {
            if (e.target.value) onChange(new Date(`${e.target.value}T00:00:00`));
          },
          style: {
            borderWidth: 1,
            borderColor: '#ccc',
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 8,
            fontSize: 13,
            fontFamily: 'inherit',
            color: colorScheme === 'dark' ? '#fff' : '#000',
            backgroundColor: 'transparent',
            width: '100%',
          },
        })}
      </View>
    );
  }

  return (
    <View style={styles.dateFieldFlex} lightColor="transparent" darkColor="transparent">
      <Pressable style={styles.dateInput} onPress={() => setPickerVisible(true)}>
        <Text style={[textStyle, !value && styles.datePlaceholder]}>{value ? formatDisplayDate(value) : label}</Text>
      </Pressable>
      {pickerVisible && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, selected) => {
            setPickerVisible(Platform.OS === 'ios' && event.type !== 'dismissed');
            if (event.type !== 'dismissed' && selected) onChange(selected);
          }}
        />
      )}
    </View>
  );
}

function RangeTabs({ value, onChange }: { value: FilterValue; onChange: (value: FilterValue) => void }) {
  return (
    <View style={styles.filterRow} lightColor="transparent" darkColor="transparent">
      {RANGES.map((r) => {
        const active = r.value === value;
        return (
          <Pressable key={r.value} onPress={() => onChange(r.value)} style={[styles.filterChip, active && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{r.label}</Text>
          </Pressable>
        );
      })}
      <Pressable onPress={() => onChange('custom')} style={[styles.filterChip, value === 'custom' && styles.filterChipActive]}>
        <Text style={[styles.filterChipText, value === 'custom' && styles.filterChipTextActive]}>Custom…</Text>
      </Pressable>
    </View>
  );
}

function TrendChart({ trend }: { trend: SalesSummary['trend'] }) {
  const colorScheme = useColorScheme();
  const maxAmount = Math.max(...trend.map((p) => p.totalAmount), 1);

  return (
    <View style={styles.section} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
      <Text style={styles.sectionTitle}>Daily revenue</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chartRow} lightColor="transparent" darkColor="transparent">
          {trend.map((point) => {
            const height = Math.max((point.totalAmount / maxAmount) * CHART_HEIGHT, 3);
            return (
              <View key={point.date} style={styles.chartBarCol} lightColor="transparent" darkColor="transparent">
                <View style={styles.chartBarTrack}>
                  <View style={[styles.chartBar, { height }]} />
                </View>
                <Text style={[styles.chartLabel, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
                  {formatShortDate(point.date)}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

// Reuses the same RangeTabs/DateField custom-range pattern as the Sales section above to pick a
// period, then renders Revenue/COGS/Gross profit/Expenses/Net profit per currency.
function PnlSection() {
  const [filter, setFilter] = useState<FilterValue>('30d');
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  const fetchPnl = useCallback(() => {
    if (filter === 'custom' && fromDate && toDate) {
      return apiClient.getProfitAndLoss(undefined, `${toDateKey(fromDate)}T00:00:00Z`, `${toDateKey(toDate)}T23:59:59Z`);
    }
    return apiClient.getProfitAndLoss(filter === 'custom' ? undefined : filter);
  }, [filter, fromDate, toDate]);

  const cacheKey = filter === 'custom' && fromDate && toDate ? `pnl:custom:${toDateKey(fromDate)}:${toDateKey(toDate)}` : `pnl:${filter}`;
  const { data: pnl, error, refreshing, isFromCache, reload: load } = useCachedFetch<ProfitAndLossResult>(cacheKey, fetchPnl);

  const applyCustomRange = useCallback(
    (isRefresh = false) => {
      if (!fromDate || !toDate) {
        setDateError('Pick both a from and to date.');
        return;
      }
      if (fromDate > toDate) {
        setDateError('The from date must be before the to date.');
        return;
      }
      setDateError(null);
      load(isRefresh);
    },
    [fromDate, toDate, load]
  );

  useFocusEffect(
    useCallback(() => {
      if (filter === 'custom') return;
      load();
    }, [filter, load])
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (filter === 'custom' ? applyCustomRange(true) : load(true))} />}
    >
      <RangeTabs value={filter} onChange={setFilter} />
      {filter === 'custom' && (
        <View style={styles.customRangeRow} lightColor="transparent" darkColor="transparent">
          <DateField label="From" value={fromDate} onChange={setFromDate} />
          <DateField label="To" value={toDate} onChange={setToDate} />
          <Pressable style={styles.applyButton} onPress={() => applyCustomRange(false)}>
            <Text style={styles.applyButtonText}>Apply</Text>
          </Pressable>
        </View>
      )}
      {dateError && <Text style={styles.error}>{dateError}</Text>}

      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && pnl === null && <ActivityIndicator style={styles.loading} />}

      {!error && pnl !== null && (
        <>
          {pnl.currencies.length === 0 && <Text style={styles.empty}>No revenue, cost, or expenses in this range yet.</Text>}
          {pnl.currencies.map((c) => (
            <View key={c.currency} style={styles.section} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
              <Text style={styles.sectionTitle}>{c.currency}</Text>
              <View style={styles.pnlRow} lightColor="transparent" darkColor="transparent">
                <Text style={styles.pnlLabel}>Revenue (excl. VAT)</Text>
                <Text style={styles.pnlValue}>{formatMoney(c.revenue, c.currency)}</Text>
              </View>
              <View style={styles.pnlRow} lightColor="transparent" darkColor="transparent">
                <Text style={styles.pnlLabel}>Cost of goods sold</Text>
                <Text style={styles.pnlValue}>({formatMoney(c.costOfGoodsSold, c.currency)})</Text>
              </View>
              <View style={[styles.pnlRow, styles.pnlSubtotalRow]} lightColor="transparent" darkColor="transparent">
                <Text style={styles.pnlSubtotalLabel}>Gross profit</Text>
                <Text style={styles.pnlSubtotalValue}>{formatMoney(c.grossProfit, c.currency)}</Text>
              </View>
              <View style={styles.pnlRow} lightColor="transparent" darkColor="transparent">
                <Text style={styles.pnlLabel}>Expenses</Text>
                <Text style={styles.pnlValue}>({formatMoney(c.expenses, c.currency)})</Text>
              </View>
              <View style={[styles.pnlRow, styles.pnlTotalRow]} lightColor="transparent" darkColor="transparent">
                <Text style={styles.pnlTotalLabel}>Net profit</Text>
                <Text style={styles.pnlTotalValue}>{formatMoney(c.netProfit, c.currency)}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.pnlFootnote}>* Cost of goods uses each item's most recent purchase cost, not exact FIFO.</Text>
        </>
      )}
    </ScrollView>
  );
}

// One-day picker (not a range) — defaults to today. Reuses DateField with a single value.
function CashUpSection() {
  const [date, setDate] = useState<Date>(new Date());

  const fetchCashUp = useCallback(() => apiClient.getCashUp(toDateKey(date)), [date]);
  const { data: cashUp, error, refreshing, isFromCache, reload: load } = useCachedFetch<CashUpResult>(`cashup:${toDateKey(date)}`, fetchCashUp);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      <View style={styles.customRangeRow} lightColor="transparent" darkColor="transparent">
        <DateField label="Date" value={date} onChange={setDate} />
      </View>

      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && cashUp === null && <ActivityIndicator style={styles.loading} />}

      {!error && cashUp !== null && (
        <>
          {cashUp.currencies.length === 0 && <Text style={styles.empty}>No sales or expenses on this day yet.</Text>}
          {cashUp.currencies.map((c) => (
            <View key={c.currency} style={styles.section} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
              <Text style={styles.sectionTitle}>{c.currency}</Text>
              <Text style={styles.cashUpSubheading}>Sales collected</Text>
              {c.salesByProvider.map((t) => (
                <View key={`sale-${t.provider}`} style={styles.pnlRow} lightColor="transparent" darkColor="transparent">
                  <Text style={styles.pnlLabel}>
                    {t.provider} ({t.count})
                  </Text>
                  <Text style={styles.pnlValue}>{formatMoney(t.totalAmount, c.currency)}</Text>
                </View>
              ))}
              {c.salesByProvider.length === 0 && <Text style={styles.empty}>No sales.</Text>}

              <Text style={[styles.cashUpSubheading, styles.cashUpSubheadingSpaced]}>Expenses paid</Text>
              {c.expensesByProvider.map((t) => (
                <View key={`expense-${t.provider}`} style={styles.pnlRow} lightColor="transparent" darkColor="transparent">
                  <Text style={styles.pnlLabel}>
                    {t.provider} ({t.count})
                  </Text>
                  <Text style={styles.pnlValue}>({formatMoney(t.totalAmount, c.currency)})</Text>
                </View>
              ))}
              {c.expensesByProvider.length === 0 && <Text style={styles.empty}>No expenses.</Text>}

              <View style={[styles.pnlRow, styles.pnlTotalRow]} lightColor="transparent" darkColor="transparent">
                <Text style={styles.pnlTotalLabel}>Net cash movement</Text>
                <Text style={styles.pnlTotalValue}>{formatMoney(c.netCashMovement, c.currency)}</Text>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function friendlySourceType(sourceType: string): string {
  switch (sourceType) {
    case 'Sale':
      return 'Sales';
    case 'Expense':
      return 'Expenses';
    case 'SupplierPayment':
      return 'Supplier payments';
    default:
      return sourceType;
  }
}

// The multi-period counterpart to CashUpSection above (single day only) — reuses the same
// RangeTabs/custom-range pattern as PnlSection. Bars are two-tone since net cash change can go
// negative, unlike TrendChart's always-positive revenue bars.
function CashFlowChart({ buckets }: { buckets: CashFlowResult['currencies'][number]['buckets'] }) {
  const colorScheme = useColorScheme();
  const maxAbs = Math.max(...buckets.map((b) => Math.abs(b.netChange)), 1);

  return (
    <View style={styles.section} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
      <Text style={styles.sectionTitle}>Net cash change</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chartRow} lightColor="transparent" darkColor="transparent">
          {buckets.map((bucket) => {
            const height = Math.max((Math.abs(bucket.netChange) / maxAbs) * CHART_HEIGHT, 3);
            return (
              <View key={bucket.periodStart} style={styles.chartBarCol} lightColor="transparent" darkColor="transparent">
                <View style={styles.chartBarTrack}>
                  <View style={[styles.chartBar, bucket.netChange < 0 ? styles.chartBarNegative : styles.chartBarPositive, { height }]} />
                </View>
                <Text style={[styles.chartLabel, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
                  {formatShortDate(bucket.periodStart)}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function CashFlowSection() {
  const [filter, setFilter] = useState<FilterValue>('30d');
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  const fetchCashFlow = useCallback(() => {
    if (filter === 'custom' && fromDate && toDate) {
      return apiClient.getCashFlow(undefined, `${toDateKey(fromDate)}T00:00:00Z`, `${toDateKey(toDate)}T23:59:59Z`);
    }
    return apiClient.getCashFlow(filter === 'custom' ? undefined : filter);
  }, [filter, fromDate, toDate]);

  const cacheKey = filter === 'custom' && fromDate && toDate ? `cashflow:custom:${toDateKey(fromDate)}:${toDateKey(toDate)}` : `cashflow:${filter}`;
  const { data: cashFlow, error, refreshing, isFromCache, reload: load } = useCachedFetch<CashFlowResult>(cacheKey, fetchCashFlow);

  const applyCustomRange = useCallback(
    (isRefresh = false) => {
      if (!fromDate || !toDate) {
        setDateError('Pick both a from and to date.');
        return;
      }
      if (fromDate > toDate) {
        setDateError('The from date must be before the to date.');
        return;
      }
      setDateError(null);
      load(isRefresh);
    },
    [fromDate, toDate, load]
  );

  useFocusEffect(
    useCallback(() => {
      if (filter === 'custom') return;
      load();
    }, [filter, load])
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (filter === 'custom' ? applyCustomRange(true) : load(true))} />}
    >
      <RangeTabs value={filter} onChange={setFilter} />
      {filter === 'custom' && (
        <View style={styles.customRangeRow} lightColor="transparent" darkColor="transparent">
          <DateField label="From" value={fromDate} onChange={setFromDate} />
          <DateField label="To" value={toDate} onChange={setToDate} />
          <Pressable style={styles.applyButton} onPress={() => applyCustomRange(false)}>
            <Text style={styles.applyButtonText}>Apply</Text>
          </Pressable>
        </View>
      )}
      {dateError && <Text style={styles.error}>{dateError}</Text>}

      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && cashFlow === null && <ActivityIndicator style={styles.loading} />}

      {!error && cashFlow !== null && (
        <>
          {cashFlow.currencies.length === 0 && <Text style={styles.empty}>No cash movement in this range yet.</Text>}
          {cashFlow.currencies.map((c) => (
            <View key={c.currency}>
              {c.buckets.length > 1 && <CashFlowChart buckets={c.buckets} />}
              <View style={styles.section} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
                <Text style={styles.sectionTitle}>{c.currency}</Text>
                <Text style={styles.cashUpSubheading}>Cash in</Text>
                {c.inflowBreakdown.map((item) => (
                  <View key={`in-${item.sourceType}`} style={styles.pnlRow} lightColor="transparent" darkColor="transparent">
                    <Text style={styles.pnlLabel}>{friendlySourceType(item.sourceType)}</Text>
                    <Text style={styles.pnlValue}>{formatMoney(item.amount, c.currency)}</Text>
                  </View>
                ))}
                {c.inflowBreakdown.length === 0 && <Text style={styles.empty}>No cash in.</Text>}

                <Text style={[styles.cashUpSubheading, styles.cashUpSubheadingSpaced]}>Cash out</Text>
                {c.outflowBreakdown.map((item) => (
                  <View key={`out-${item.sourceType}`} style={styles.pnlRow} lightColor="transparent" darkColor="transparent">
                    <Text style={styles.pnlLabel}>{friendlySourceType(item.sourceType)}</Text>
                    <Text style={styles.pnlValue}>({formatMoney(item.amount, c.currency)})</Text>
                  </View>
                ))}
                {c.outflowBreakdown.length === 0 && <Text style={styles.empty}>No cash out.</Text>}

                <View style={[styles.pnlRow, styles.pnlTotalRow]} lightColor="transparent" darkColor="transparent">
                  <Text style={styles.pnlTotalLabel}>Net cash flow</Text>
                  <Text style={styles.pnlTotalValue}>{formatMoney(c.netCashFlow, c.currency)}</Text>
                </View>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

// Mirrors LedgerAccountCodes.StandardAccounts (server/src/AiBusinessPlatform.Application/Tools) —
// a fixed, code-referenced chart of accounts, not something the app lets you create/edit.
const ACCOUNT_FILTERS: readonly { code: string; label: string }[] = [
  { code: 'cash', label: 'Cash' },
  { code: 'bank', label: 'Bank' },
  { code: 'mobile_money', label: 'Mobile Money' },
  { code: 'other_receipts', label: 'Other Receipts' },
  { code: 'inventory', label: 'Inventory' },
  { code: 'accounts_payable', label: 'Accounts Payable' },
  { code: 'vat_payable', label: 'VAT Payable' },
  { code: 'sales_revenue', label: 'Sales Revenue' },
  { code: 'cost_of_goods_sold', label: 'Cost of Goods Sold' },
  { code: 'expense_rent', label: 'Rent Expense' },
  { code: 'expense_utilities', label: 'Utilities Expense' },
  { code: 'expense_wages', label: 'Wages Expense' },
  { code: 'expense_supplies', label: 'Supplies Expense' },
  { code: 'expense_transport', label: 'Transport Expense' },
  { code: 'expense_marketing', label: 'Marketing Expense' },
  { code: 'expense_other', label: 'Other Expense' },
];

function accountLabel(code: string): string {
  return ACCOUNT_FILTERS.find((a) => a.code === code)?.label ?? code;
}

// Audit-level views (trial balance / general ledger) — power-user tools better suited to the
// Assistant ("what's my trial balance?") than a full-blown UI, so this stays a single "Ledger"
// section with a lightweight internal toggle rather than two more top-level Sales tabs.
function TrialBalanceView() {
  const fetchTrialBalance = useCallback(() => apiClient.getTrialBalance(), []);
  const { data: trialBalance, error, refreshing, isFromCache, reload: load } = useCachedFetch<TrialBalanceResult>('trial-balance', fetchTrialBalance);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && trialBalance === null && <ActivityIndicator style={styles.loading} />}

      {!error && trialBalance !== null && (
        <View style={styles.section} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
          {trialBalance.rows.length === 0 && <Text style={styles.empty}>No ledger activity yet.</Text>}
          {trialBalance.rows.map((row) => (
            <View key={row.accountCode} style={styles.ledgerRow} lightColor="transparent" darkColor="transparent">
              <View style={styles.ledgerInfo} lightColor="transparent" darkColor="transparent">
                <Text style={styles.rowPrimary} numberOfLines={1}>
                  {row.accountName}
                </Text>
                <Text style={styles.rowSecondary}>
                  {row.accountType} · Dr {row.totalDebit.toFixed(2)} / Cr {row.totalCredit.toFixed(2)}
                </Text>
              </View>
              <Text style={styles.rowPrimary}>{row.balance.toFixed(2)}</Text>
            </View>
          ))}
          {trialBalance.rows.length > 0 && (
            <View style={[styles.pnlRow, styles.pnlTotalRow]} lightColor="transparent" darkColor="transparent">
              <Text style={styles.pnlTotalLabel}>Total debits / credits</Text>
              <Text style={styles.pnlTotalValue}>
                {trialBalance.totalDebits.toFixed(2)} / {trialBalance.totalCredits.toFixed(2)}
              </Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function GeneralLedgerView() {
  const [accountCode, setAccountCode] = useState<string | null>(null);

  const fetchGeneralLedger = useCallback(() => apiClient.getGeneralLedger(accountCode ?? undefined), [accountCode]);
  const cacheKey = accountCode ? `general-ledger:${accountCode}` : 'general-ledger:all';
  const { data: ledger, error, refreshing, isFromCache, reload: load } = useCachedFetch<GeneralLedgerResult>(cacheKey, fetchGeneralLedger);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.filterRow} lightColor="transparent" darkColor="transparent">
          <Pressable onPress={() => setAccountCode(null)} style={[styles.filterChip, accountCode === null && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, accountCode === null && styles.filterChipTextActive]}>All accounts</Text>
          </Pressable>
          {ACCOUNT_FILTERS.map((a) => {
            const active = a.code === accountCode;
            return (
              <Pressable key={a.code} onPress={() => setAccountCode(a.code)} style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{a.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && ledger === null && <ActivityIndicator style={styles.loading} />}

      {!error && ledger !== null && (
        <>
          {ledger.lines.length === 0 && <Text style={styles.empty}>No journal entries yet.</Text>}
          {ledger.lines.map((line, index) => (
            <View key={`${line.journalEntryId}-${index}`} style={styles.ledgerRow} lightColor="transparent" darkColor="transparent">
              <View style={styles.ledgerInfo} lightColor="transparent" darkColor="transparent">
                <Text style={styles.rowPrimary} numberOfLines={1}>
                  {line.description}
                </Text>
                <Text style={styles.rowSecondary}>
                  {accountLabel(line.accountCode)} · {new Date(line.postedAt).toLocaleDateString()}
                </Text>
              </View>
              <Text style={line.debit > 0 ? styles.ledgerDebit : styles.ledgerCredit}>
                {line.debit > 0 ? line.debit.toFixed(2) : `(${line.credit.toFixed(2)})`}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function LedgerSection() {
  const [subview, setSubview] = useState<'trial-balance' | 'general-ledger'>('trial-balance');

  return (
    <View style={styles.container}>
      <View style={styles.screenHeaderPadding} lightColor="transparent" darkColor="transparent">
        <View style={styles.filterRow} lightColor="transparent" darkColor="transparent">
          <Pressable
            onPress={() => setSubview('trial-balance')}
            style={[styles.filterChip, subview === 'trial-balance' && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, subview === 'trial-balance' && styles.filterChipTextActive]}>Trial Balance</Text>
          </Pressable>
          <Pressable
            onPress={() => setSubview('general-ledger')}
            style={[styles.filterChip, subview === 'general-ledger' && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, subview === 'general-ledger' && styles.filterChipTextActive]}>General Ledger</Text>
          </Pressable>
        </View>
      </View>
      {subview === 'trial-balance' ? <TrialBalanceView /> : <GeneralLedgerView />}
    </View>
  );
}

const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = ['Rent', 'Utilities', 'Wages', 'Supplies', 'Transport', 'Marketing', 'Other'];
const EXPENSE_PAYMENT_METHODS: readonly PosPaymentMethod[] = ['Cash', 'EcoCash', 'Bank', 'Other'];

function ExpensesSection() {
  const inputStyle = useInputStyle();
  const isOnline = useIsOnline();
  const fetchExpenses = useCallback(() => apiClient.getExpenses(), []);
  const { data: expenses, error, refreshing, isFromCache, reload: load } = useCachedFetch<ExpenseSummary[]>('expenses', fetchExpenses);

  const [category, setCategory] = useState<ExpenseCategory>('Other');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('Cash');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const submit = async () => {
    setFormError(null);
    const parsedAmount = Number(amount);
    if (!description.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError('Description and a valid amount greater than zero are required.');
      return;
    }
    setSaving(true);
    try {
      const input: CreateExpenseInput = { category, description: description.trim(), amount: parsedAmount, paymentMethod };
      await apiClient.createExpense(input);
      setDescription('');
      setAmount('');
      load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await apiClient.deleteExpense(id);
      load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && expenses === null && <ActivityIndicator style={styles.loading} />}
      {!error && expenses !== null && expenses.length === 0 && <Text style={styles.empty}>No expenses recorded yet.</Text>}
      {!error &&
        expenses !== null &&
        expenses.map((expense) => (
          <View key={expense.id} style={styles.expenseRow} lightColor="transparent" darkColor="transparent">
            <View style={styles.expenseInfo} lightColor="transparent" darkColor="transparent">
              <Text style={styles.rowPrimary} numberOfLines={1}>
                {expense.description}
              </Text>
              <Text style={styles.rowSecondary}>
                {expense.category} · {expense.paymentMethod} · {new Date(expense.incurredAt).toLocaleDateString()}
              </Text>
            </View>
            <Text style={styles.rowPrimary}>{formatMoney(expense.amount, expense.currency)}</Text>
            <Pressable
              style={[styles.expenseDeleteButton, (deletingId === expense.id || !isOnline) && styles.buttonDisabled]}
              disabled={deletingId === expense.id || !isOnline}
              onPress={() => remove(expense.id)}
            >
              <Text style={styles.expenseDeleteText}>Delete</Text>
            </Pressable>
          </View>
        ))}

      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <Text style={styles.sectionTitle}>Add expense</Text>
      <View style={styles.filterRow}>
        {EXPENSE_CATEGORIES.map((c) => {
          const active = c === category;
          return (
            <Pressable key={c} onPress={() => setCategory(c)} style={[styles.filterChip, active && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{c}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput style={[inputStyle, styles.expenseInput]} placeholder="Description" value={description} onChangeText={setDescription} />
      <TextInput
        style={[inputStyle, styles.expenseInput]}
        placeholder="Amount"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />
      <View style={styles.filterRow}>
        {EXPENSE_PAYMENT_METHODS.map((method) => {
          const active = method === paymentMethod;
          return (
            <Pressable key={method} onPress={() => setPaymentMethod(method)} style={[styles.filterChip, active && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{method}</Text>
            </Pressable>
          );
        })}
      </View>
      {formError && <Text style={styles.error}>{formError}</Text>}
      {!isOnline && <Text style={styles.error}>You're offline — connect to save.</Text>}
      <Pressable style={[styles.applyButton, styles.expenseSubmitButton, (saving || !isOnline) && styles.buttonDisabled]} disabled={saving || !isOnline} onPress={submit}>
        <Text style={styles.applyButtonText}>{saving ? 'Saving…' : '+ Add expense'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function useInputStyle() {
  const colorScheme = useColorScheme();
  return [styles.expenseTextInput, colorScheme === 'dark' ? styles.dateInputDark : styles.dateInputLight];
}

function SalesSection() {
  const colorScheme = useColorScheme();
  const [filter, setFilter] = useState<FilterValue>('30d');
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  const fetchSummary = useCallback(() => {
    if (filter === 'custom' && fromDate && toDate) {
      return apiClient.getSalesSummary(undefined, `${toDateKey(fromDate)}T00:00:00Z`, `${toDateKey(toDate)}T23:59:59Z`);
    }
    return apiClient.getSalesSummary(filter === 'custom' ? undefined : filter);
  }, [filter, fromDate, toDate]);

  const cacheKey =
    filter === 'custom' && fromDate && toDate ? `sales:custom:${toDateKey(fromDate)}:${toDateKey(toDate)}` : `sales:${filter}`;

  const { data: summary, error, refreshing, isFromCache, reload: load } = useCachedFetch<SalesSummary>(cacheKey, fetchSummary);

  const applyCustomRange = useCallback(
    (isRefresh = false) => {
      if (!fromDate || !toDate) {
        setDateError('Pick both a from and to date.');
        return;
      }
      if (fromDate > toDate) {
        setDateError('The from date must be before the to date.');
        return;
      }
      setDateError(null);
      load(isRefresh);
    },
    [fromDate, toDate, load]
  );

  useFocusEffect(
    useCallback(() => {
      if (filter === 'custom') return;
      load();
    }, [filter, load])
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => (filter === 'custom' ? applyCustomRange(true) : load(true))} />
      }
    >
      <RangeTabs value={filter} onChange={setFilter} />

      {filter === 'custom' && (
        <View style={styles.customRangeRow} lightColor="transparent" darkColor="transparent">
          <DateField label="From" value={fromDate} onChange={setFromDate} />
          <DateField label="To" value={toDate} onChange={setToDate} />
          <Pressable style={styles.applyButton} onPress={() => applyCustomRange(false)}>
            <Text style={styles.applyButtonText}>Apply</Text>
          </Pressable>
        </View>
      )}
      {dateError && <Text style={styles.error}>{dateError}</Text>}

      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && summary === null && <ActivityIndicator style={styles.loading} />}

      {!error && summary !== null && (
        <>
          <View style={styles.tiles}>
            <View style={styles.tile} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
              <Text style={styles.tileValue}>{summary.totalOrders}</Text>
              <Text style={styles.tileLabel}>Paid orders</Text>
            </View>
            {summary.totals.length === 0 ? (
              <View style={styles.tile} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
                <Text style={styles.tileValue}>—</Text>
                <Text style={styles.tileLabel}>Revenue</Text>
              </View>
            ) : (
              summary.totals.map((t) => (
                <View key={t.currency} style={styles.tile} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
                  <Text style={styles.tileValue}>{formatMoney(t.totalAmount, t.currency)}</Text>
                  <Text style={styles.tileLabel}>Revenue ({t.orderCount})</Text>
                </View>
              ))
            )}
          </View>

          {summary.totalOrders === 0 && (
            <Text style={styles.empty}>No paid orders in this range yet.</Text>
          )}

          {summary.trend.length > 0 && <TrendChart trend={summary.trend} />}

          {summary.topItems.length > 0 && (
            <View style={styles.section} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
              <Text style={styles.sectionTitle}>Top items</Text>
              {summary.topItems.map((item, index) => (
                <View key={item.catalogItemId} style={styles.topItemRow} lightColor="transparent" darkColor="transparent">
                  <View style={styles.topItemNameCol} lightColor="transparent" darkColor="transparent">
                    <Text style={styles.rowPrimary} numberOfLines={1}>
                      {index + 1}. {item.name}
                    </Text>
                    <Text style={[styles.rowSecondary, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
                      {item.quantitySold} sold
                    </Text>
                  </View>
                  <Text style={styles.rowPrimary}>{item.revenue.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

export default function SalesScreen() {
  const router = useRouter();
  const canManageOrders = useHasPermission('ManageOrders');
  const [section, setSection] = useState<Section>('sales');

  return (
    <View style={styles.screenContainer}>
      <View style={[styles.headerRow, styles.screenHeaderPadding]} lightColor="transparent" darkColor="transparent">
        <Text style={styles.title}>Sales</Text>
        {canManageOrders && (
          <Pressable style={styles.saleButton} onPress={() => router.push('/pos')}>
            <Text style={styles.saleButtonText}>+ New sale</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.screenHeaderPadding} lightColor="transparent" darkColor="transparent">
        <SectionTabs value={section} onChange={setSection} />
      </View>
      {section === 'sales' && <SalesSection />}
      {section === 'pnl' && <PnlSection />}
      {section === 'cashup' && <CashUpSection />}
      {section === 'cashflow' && <CashFlowSection />}
      {section === 'ledger' && <LedgerSection />}
      {section === 'expenses' && <ExpensesSection />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 24, paddingHorizontal: 16, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: 'bold' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  saleButton: { backgroundColor: '#2e7d32', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  saleButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#ccc' },
  filterChipActive: { backgroundColor: '#007aff', borderColor: '#007aff' },
  filterChipText: { fontSize: 13, fontWeight: '500', opacity: 0.7 },
  filterChipTextActive: { color: '#fff', opacity: 1 },
  customRangeRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  dateFieldFlex: { flex: 1 },
  dateInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  dateInputLight: { color: '#000' },
  dateInputDark: { color: '#fff' },
  datePlaceholder: { opacity: 0.5 },
  applyButton: { backgroundColor: '#007aff', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 6 },
  applyButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  separator: { marginTop: 12, marginBottom: 12, height: 1, width: '100%' },
  loading: { marginTop: 24 },
  error: { color: '#c0392b', marginBottom: 12 },
  cacheNote: { opacity: 0.6, fontSize: 12, marginBottom: 12 },
  empty: { opacity: 0.6, marginBottom: 16 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  tile: { flexGrow: 1, minWidth: 130, alignItems: 'center', paddingVertical: 20, borderWidth: 1, borderColor: '#ccc', borderRadius: 10 },
  tileValue: { fontSize: 22, fontWeight: 'bold' },
  tileLabel: { marginTop: 4, fontSize: 12, opacity: 0.7 },
  section: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 14, marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '700', opacity: 0.5, textTransform: 'uppercase', marginBottom: 12 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingBottom: 4 },
  chartBarCol: { alignItems: 'center', width: 32 },
  chartBarTrack: { height: CHART_HEIGHT, justifyContent: 'flex-end' },
  chartBar: { width: 16, backgroundColor: '#007aff', borderRadius: 4 },
  chartBarPositive: { backgroundColor: '#2e7d32' },
  chartBarNegative: { backgroundColor: '#c0392b' },
  chartLabel: { fontSize: 10, marginTop: 6 },
  topItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  topItemNameCol: { flexShrink: 1, paddingRight: 12 },
  rowPrimary: { fontSize: 14, fontWeight: '600' },
  rowSecondary: { fontSize: 12, marginTop: 2 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  screenContainer: { flex: 1 },
  screenHeaderPadding: { paddingHorizontal: 16 },
  sectionRow: { flexDirection: 'row', gap: 8, marginBottom: 12, paddingTop: 12 },
  sectionChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' },
  sectionChipActive: { backgroundColor: '#007aff', borderColor: '#007aff' },
  sectionChipText: { fontSize: 13, fontWeight: '600', opacity: 0.7 },
  sectionChipTextActive: { color: '#fff', opacity: 1 },
  pnlRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  pnlLabel: { fontSize: 13, opacity: 0.75 },
  pnlValue: { fontSize: 13, opacity: 0.75 },
  pnlSubtotalRow: { marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#ccc' },
  pnlSubtotalLabel: { fontSize: 14, fontWeight: '600' },
  pnlSubtotalValue: { fontSize: 14, fontWeight: '600' },
  pnlTotalRow: { marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ccc' },
  pnlTotalLabel: { fontSize: 15, fontWeight: '700' },
  pnlTotalValue: { fontSize: 15, fontWeight: '700' },
  pnlFootnote: { fontSize: 11, opacity: 0.5, marginTop: -8, marginBottom: 16 },
  cashUpSubheading: { fontSize: 11, fontWeight: '700', opacity: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  cashUpSubheadingSpaced: { marginTop: 12 },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  expenseInfo: { flexShrink: 1 },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  ledgerInfo: { flexShrink: 1 },
  ledgerDebit: { fontSize: 14, fontWeight: '600', color: '#2e7d32' },
  ledgerCredit: { fontSize: 14, fontWeight: '600', color: '#c0392b' },
  expenseDeleteButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#c0392b' },
  expenseDeleteText: { color: '#c0392b', fontSize: 12, fontWeight: '600' },
  expenseInput: { marginTop: 10 },
  expenseSubmitButton: { marginTop: 14, alignItems: 'center' },
  expenseTextInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  buttonDisabled: { opacity: 0.6 },
});
