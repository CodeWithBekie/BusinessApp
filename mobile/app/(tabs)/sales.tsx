import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import { createElement, useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { apiClient, SalesRange, SalesSummary } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { formatMoney } from '@/src/common/format';
import { useCachedFetch } from '@/src/offline/useCachedFetch';

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

export default function SalesScreen() {
  const router = useRouter();
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
      <View style={styles.headerRow} lightColor="transparent" darkColor="transparent">
        <Text style={styles.title}>Sales</Text>
        <Pressable style={styles.saleButton} onPress={() => router.push('/pos')}>
          <Text style={styles.saleButtonText}>+ New sale</Text>
        </Pressable>
      </View>
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
  chartLabel: { fontSize: 10, marginTop: 6 },
  topItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  topItemNameCol: { flexShrink: 1, paddingRight: 12 },
  rowPrimary: { fontSize: 14, fontWeight: '600' },
  rowSecondary: { fontSize: 12, marginTop: 2 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
});
