import { useCallback } from 'react';

import { apiClient, PendingApproval } from '@/src/api/client';
import { DataListScreen } from '@/src/components/DataListScreen';

export default function ApprovalsScreen() {
  const fetcher = useCallback(() => apiClient.getApprovals(), []);

  return (
    <DataListScreen<PendingApproval>
      title="Approvals"
      fetcher={fetcher}
      keyExtractor={(item) => item.id}
      renderItem={(item) => `${item.actionType} — ${item.status}`}
      emptyMessage="No pending approvals."
    />
  );
}
