import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { apiClient, PendingApproval } from '@/src/api/client';
import { Text, View } from '@/components/Themed';

interface CancelPaidOrderDetails {
  OrderId: string;
  Amount: number;
  Currency: string;
  Reason?: string;
}

// Only action type today (Section 10.5) is cancel_paid_order — parsed for a readable summary.
// Unrecognized action types fall back to raw JSON rather than crashing, so this survives a new
// action type being added on the backend before the mobile app is updated to understand it.
function describeDetails(actionType: string, detailsJson: string): string {
  if (actionType === 'cancel_paid_order') {
    try {
      const details = JSON.parse(detailsJson) as CancelPaidOrderDetails;
      return `Cancel paid order — ${details.Currency} ${details.Amount}${details.Reason ? ` (${details.Reason})` : ''}`;
    } catch {
      // fall through to raw JSON below
    }
  }
  return detailsJson;
}

export default function ApprovalsScreen() {
  const [items, setItems] = useState<PendingApproval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiClient
      .getApprovals()
      .then(setItems)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = useCallback(
    async (id: string, decision: 'approve' | 'reject') => {
      setActionError(null);
      setPendingActionId(id);
      try {
        await apiClient.decideApproval(id, decision);
        load();
      } catch (err) {
        setActionError((err as Error).message);
      } finally {
        setPendingActionId(null);
      }
    },
    [load]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Approvals</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {actionError && <Text style={styles.error}>{actionError}</Text>}
      {!error && items === null && <ActivityIndicator />}
      {!error && items !== null && items.length === 0 && <Text>No pending approvals.</Text>}
      {!error &&
        items?.map((item) => (
          <View key={item.id} style={styles.card} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
            <Text style={styles.cardTitle}>{describeDetails(item.actionType, item.detailsJson)}</Text>
            <Text style={styles.cardMeta}>Requested {new Date(item.requestedAt).toLocaleString()}</Text>
            {item.status === 'Pending' ? (
              <View style={styles.actions}>
                <Pressable
                  style={[styles.button, styles.approveButton]}
                  disabled={pendingActionId === item.id}
                  onPress={() => decide(item.id, 'approve')}
                >
                  <Text style={styles.buttonText}>{pendingActionId === item.id ? '…' : 'Approve'}</Text>
                </Pressable>
                <Pressable
                  style={[styles.button, styles.rejectButton]}
                  disabled={pendingActionId === item.id}
                  onPress={() => decide(item.id, 'reject')}
                >
                  <Text style={styles.buttonText}>{pendingActionId === item.id ? '…' : 'Reject'}</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.decidedBadge}>{item.status}</Text>
            )}
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24, paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: 'bold' },
  separator: { marginVertical: 16, height: 1, width: '100%' },
  error: { color: '#c0392b', marginBottom: 12 },
  card: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardMeta: { fontSize: 12, opacity: 0.6, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  button: { flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  approveButton: { backgroundColor: '#2e7d32' },
  rejectButton: { backgroundColor: '#c0392b' },
  buttonText: { color: '#fff', fontWeight: '600' },
  decidedBadge: { marginTop: 12, fontWeight: '600', opacity: 0.7 },
});
