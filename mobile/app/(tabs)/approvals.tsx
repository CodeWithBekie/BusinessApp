import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { apiClient, PendingApproval } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { radius, semanticColors, spacing, typography } from '@/constants/theme';
import { APPROVAL_STATUS_COLORS, APPROVAL_STATUS_FILTERS, ApprovalStatus } from '@/src/approvals/approvalStatus';
import { formatRelativeDate } from '@/src/common/format';
import { useCachedFetch } from '@/src/offline/useCachedFetch';
import { useIsOnline } from '@/src/offline/networkStatus';
import { useHasPermission } from '@/src/auth/permissions';

type FilterValue = ApprovalStatus | 'All';
type Decision = 'approve' | 'reject';

interface CancelPaidOrderDetails {
  OrderId: string;
  Amount: number;
  Currency: string;
  Reason?: string;
}

interface SendCustomerMessageDetails {
  CustomerId: string;
  DraftedText: string;
  RequestedAt: string;
}

interface PaymentProofSubmittedDetails {
  OrderId: string;
  PaymentId: string;
  CustomerAccountId: string;
  SubmittedAt: string;
}

// Three action types today (Section 10.5, Part 3) — each parsed for a readable summary.
// Unrecognized action types fall back to raw JSON rather than crashing, so this survives a new
// action type being added on the backend before the mobile app is updated to understand it.
function describeDetails(
  actionType: string,
  detailsJson: string
): { title: string; parsed: CancelPaidOrderDetails | null; paymentProof: PaymentProofSubmittedDetails | null } {
  if (actionType === 'cancel_paid_order') {
    try {
      const details = JSON.parse(detailsJson) as CancelPaidOrderDetails;
      return {
        title: `Cancel paid order — ${details.Currency} ${details.Amount}${details.Reason ? ` (${details.Reason})` : ''}`,
        parsed: details,
        paymentProof: null,
      };
    } catch {
      // fall through to raw JSON below
    }
  }
  if (actionType === 'send_customer_message') {
    try {
      const details = JSON.parse(detailsJson) as SendCustomerMessageDetails;
      return { title: `Send WhatsApp message — "${details.DraftedText}"`, parsed: null, paymentProof: null };
    } catch {
      // fall through to raw JSON below
    }
  }
  if (actionType === 'payment_proof_submitted') {
    try {
      const details = JSON.parse(detailsJson) as PaymentProofSubmittedDetails;
      return { title: `Payment proof submitted for order #${details.OrderId.slice(0, 8)}`, parsed: null, paymentProof: details };
    } catch {
      // fall through to raw JSON below
    }
  }
  return { title: detailsJson, parsed: null, paymentProof: null };
}

function FilterTabs({ value, onChange }: { value: FilterValue; onChange: (value: FilterValue) => void }) {
  return (
    <View style={styles.filterRow} lightColor="transparent" darkColor="transparent">
      {APPROVAL_STATUS_FILTERS.map((filter) => (
        <Chip key={filter} label={filter} active={filter === value} onPress={() => onChange(filter)} />
      ))}
    </View>
  );
}

export default function ApprovalsScreen() {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const isOnline = useIsOnline();
  const canDecideApprovals = useHasPermission('DecideApprovals');
  const [filter, setFilter] = useState<FilterValue>('Pending');
  const fetchApprovals = useCallback(() => apiClient.getApprovals(), []);
  const { data: items, error, refreshing, isFromCache, reload: load } = useCachedFetch<PendingApproval[]>('approvals', fetchApprovals);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ item: PendingApproval; decision: Decision } | null>(null);
  const [expandedProofItemId, setExpandedProofItemId] = useState<string | null>(null);
  const [proofDataUri, setProofDataUri] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);

  const toggleProof = useCallback(
    async (item: PendingApproval, paymentId: string) => {
      if (expandedProofItemId === item.id) {
        setExpandedProofItemId(null);
        setProofDataUri(null);
        return;
      }
      setExpandedProofItemId(item.id);
      setProofDataUri(null);
      setLoadingProof(true);
      try {
        const { dataUri } = await apiClient.getPaymentProofImage(paymentId);
        setProofDataUri(dataUri);
      } catch (err) {
        setActionError((err as Error).message);
      } finally {
        setLoadingProof(false);
      }
    },
    [expandedProofItemId]
  );

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
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && items === null && <ActivityIndicator style={styles.loading} />}
      {!error && items !== null && visibleItems.length === 0 && (
        <Text style={styles.empty}>No {filter === 'All' ? '' : filter.toLowerCase() + ' '}approvals.</Text>
      )}

      {!error &&
        visibleItems.map((item) => {
          const { title, paymentProof } = describeDetails(item.actionType, item.detailsJson);
          return (
            <Card key={item.id} style={styles.card}>
              <View style={styles.cardTopRow} lightColor="transparent" darkColor="transparent">
                <Text style={styles.cardTitle}>{title}</Text>
                <Badge label={item.status} color={APPROVAL_STATUS_COLORS[item.status]} />
              </View>
              <Text style={[styles.cardMeta, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
                Requested {formatRelativeDate(item.requestedAt)}
                {item.decidedAt ? ` · Decided ${formatRelativeDate(item.decidedAt)}` : ''}
              </Text>
              {paymentProof && (
                <>
                  <Pressable style={styles.inlineEditButton} onPress={() => toggleProof(item, paymentProof.PaymentId)}>
                    <Text style={[styles.inlineEditButtonText, { color: tint }]}>
                      {expandedProofItemId === item.id ? 'Hide proof' : 'View proof'}
                    </Text>
                  </Pressable>
                  {expandedProofItemId === item.id && (
                    <>
                      {loadingProof && <ActivityIndicator style={styles.loading} />}
                      {proofDataUri && <Image source={{ uri: proofDataUri }} style={styles.proofImage} resizeMode="contain" />}
                    </>
                  )}
                </>
              )}
              {item.status === 'Pending' && canDecideApprovals && (
                <>
                  <View style={styles.actions} lightColor="transparent" darkColor="transparent">
                    <Button
                      label={pendingActionId === item.id ? '…' : 'Approve'}
                      variant="success"
                      style={styles.actionButton}
                      disabled={pendingActionId === item.id || !isOnline}
                      onPress={() => setConfirmTarget({ item, decision: 'approve' })}
                    />
                    <Button
                      label={pendingActionId === item.id ? '…' : 'Reject'}
                      variant="destructive"
                      style={styles.actionButton}
                      disabled={pendingActionId === item.id || !isOnline}
                      onPress={() => setConfirmTarget({ item, decision: 'reject' })}
                    />
                  </View>
                  {!isOnline && <Text style={styles.offlineNotice}>You're offline — connect to decide.</Text>}
                </>
              )}
            </Card>
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
              <Button
                label={confirmTarget?.decision === 'approve' ? 'Approve' : 'Reject'}
                variant={confirmTarget?.decision === 'approve' ? 'success' : 'destructive'}
                style={styles.modalButton}
                onPress={performDecision}
              />
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
  title: { ...typography.title, marginBottom: spacing.md },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  separator: { marginTop: 12, marginBottom: 12, height: 1, width: '100%' },
  loading: { marginTop: 24 },
  empty: { opacity: 0.6, marginTop: 8 },
  error: { color: semanticColors.danger, marginBottom: 12 },
  cacheNote: { opacity: 0.6, fontSize: 12, marginBottom: 12 },
  card: { marginBottom: spacing.md },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { ...typography.bodyStrong, flexShrink: 1 },
  cardMeta: { ...typography.meta, marginTop: spacing.xs + 2 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  actionButton: { flex: 1, paddingVertical: 10 },
  inlineEditButton: { marginTop: spacing.sm + 2 },
  inlineEditButtonText: { fontWeight: '600', fontSize: 13 },
  proofImage: { width: '100%', height: 240, marginTop: spacing.sm + 2, borderRadius: radius.sm, backgroundColor: '#eee' },
  offlineNotice: { color: semanticColors.danger, fontSize: 12, marginTop: spacing.sm },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  modalBody: { fontSize: 14, marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1 },
  modalCancelButton: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#ccc' },
  modalCancelText: { fontWeight: '600' },
});
