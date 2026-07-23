import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { apiClient, PendingApproval } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { APPROVAL_STATUS_COLORS, APPROVAL_STATUS_FILTERS, ApprovalStatus } from '@/src/approvals/approvalStatus';
import { formatRelativeDate } from '@/src/common/format';

type FilterValue = ApprovalStatus | 'All';
type Decision = 'approve' | 'reject';

interface CancelPaidOrderDetails {
  OrderId: string;
  Amount: number;
  Currency: string;
  Reason?: string;
}

// Only action type today (Section 10.5) is cancel_paid_order — parsed for a readable summary.
// Unrecognized action types fall back to raw JSON rather than crashing, so this survives a new
// action type being added on the backend before the mobile app is updated to understand it.
function describeDetails(actionType: string, detailsJson: string): { title: string; parsed: CancelPaidOrderDetails | null } {
  if (actionType === 'cancel_paid_order') {
    try {
      const details = JSON.parse(detailsJson) as CancelPaidOrderDetails;
      return {
        title: `Cancel paid order — ${details.Currency} ${details.Amount}${details.Reason ? ` (${details.Reason})` : ''}`,
        parsed: details,
      };
    } catch {
      // fall through to raw JSON below
    }
  }
  return { title: detailsJson, parsed: null };
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
  return (
    <View style={[styles.badge, { backgroundColor: APPROVAL_STATUS_COLORS[status] }]}>
      <Text style={styles.badgeText}>{status}</Text>
    </View>
  );
}

function FilterTabs({ value, onChange }: { value: FilterValue; onChange: (value: FilterValue) => void }) {
  return (
    <View style={styles.filterRow} lightColor="transparent" darkColor="transparent">
      {APPROVAL_STATUS_FILTERS.map((filter) => {
        const active = filter === value;
        return (
          <Pressable key={filter} onPress={() => onChange(filter)} style={[styles.filterChip, active && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{filter}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ApprovalsScreen() {
  const colorScheme = useColorScheme();
  const [filter, setFilter] = useState<FilterValue>('Pending');
  const [items, setItems] = useState<PendingApproval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ item: PendingApproval; decision: Decision } | null>(null);

  const load = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    apiClient
      .getApprovals()
      .then((data) => {
        setItems(data);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setRefreshing(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const performDecision = useCallback(async () => {
    if (!confirmTarget) return;
    const { item, decision } = confirmTarget;
    setConfirmTarget(null);
    setActionError(null);
    setPendingActionId(item.id);
    try {
      await apiClient.decideApproval(item.id, decision);
      load();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setPendingActionId(null);
    }
  }, [confirmTarget, load]);

  const visibleItems = (items ?? []).filter((item) => filter === 'All' || item.status === filter);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      <Text style={styles.title}>Approvals</Text>
      <FilterTabs value={filter} onChange={setFilter} />
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {actionError && <Text style={styles.error}>{actionError}</Text>}
      {!error && items === null && <ActivityIndicator style={styles.loading} />}
      {!error && items !== null && visibleItems.length === 0 && (
        <Text style={styles.empty}>No {filter === 'All' ? '' : filter.toLowerCase() + ' '}approvals.</Text>
      )}

      {!error &&
        visibleItems.map((item) => {
          const { title } = describeDetails(item.actionType, item.detailsJson);
          return (
            <View key={item.id} style={styles.card} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
              <View style={styles.cardTopRow} lightColor="transparent" darkColor="transparent">
                <Text style={styles.cardTitle}>{title}</Text>
                <StatusBadge status={item.status} />
              </View>
              <Text style={[styles.cardMeta, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
                Requested {formatRelativeDate(item.requestedAt)}
                {item.decidedAt ? ` · Decided ${formatRelativeDate(item.decidedAt)}` : ''}
              </Text>
              {item.status === 'Pending' && (
                <View style={styles.actions} lightColor="transparent" darkColor="transparent">
                  <Pressable
                    style={[styles.button, styles.approveButton]}
                    disabled={pendingActionId === item.id}
                    onPress={() => setConfirmTarget({ item, decision: 'approve' })}
                  >
                    <Text style={styles.buttonText}>{pendingActionId === item.id ? '…' : 'Approve'}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.button, styles.rejectButton]}
                    disabled={pendingActionId === item.id}
                    onPress={() => setConfirmTarget({ item, decision: 'reject' })}
                  >
                    <Text style={styles.buttonText}>{pendingActionId === item.id ? '…' : 'Reject'}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}

      <Modal visible={confirmTarget !== null} transparent animationType="fade" onRequestClose={() => setConfirmTarget(null)}>
        <View style={styles.modalOverlay} lightColor="rgba(0,0,0,0.4)" darkColor="rgba(0,0,0,0.6)">
          <View style={styles.modalCard} lightColor="#fff" darkColor="#1c1c1e">
            <Text style={styles.modalTitle}>
              {confirmTarget?.decision === 'approve' ? 'Approve this request?' : 'Reject this request?'}
            </Text>
            {confirmTarget && (
              <Text style={[styles.modalBody, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
                {describeDetails(confirmTarget.item.actionType, confirmTarget.item.detailsJson).title}
              </Text>
            )}
            <View style={styles.modalActions} lightColor="transparent" darkColor="transparent">
              <Pressable style={[styles.modalButton, styles.modalCancelButton]} onPress={() => setConfirmTarget(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalButton,
                  confirmTarget?.decision === 'approve' ? styles.approveButton : styles.rejectButton,
                ]}
                onPress={performDecision}
              >
                <Text style={styles.buttonText}>{confirmTarget?.decision === 'approve' ? 'Approve' : 'Reject'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 24, paddingHorizontal: 16, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#ccc' },
  filterChipActive: { backgroundColor: '#007aff', borderColor: '#007aff' },
  filterChipText: { fontSize: 13, fontWeight: '500', opacity: 0.7 },
  filterChipTextActive: { color: '#fff', opacity: 1 },
  separator: { marginTop: 12, marginBottom: 12, height: 1, width: '100%' },
  loading: { marginTop: 24 },
  empty: { opacity: 0.6, marginTop: 8 },
  error: { color: '#c0392b', marginBottom: 12 },
  card: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 14, marginBottom: 12 },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  cardMeta: { fontSize: 12, marginTop: 6 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  button: { flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  approveButton: { backgroundColor: '#2e7d32' },
  rejectButton: { backgroundColor: '#c0392b' },
  buttonText: { color: '#fff', fontWeight: '600' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  modalBody: { fontSize: 14, marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalCancelButton: { borderWidth: 1, borderColor: '#ccc' },
  modalCancelText: { fontWeight: '600' },
});
