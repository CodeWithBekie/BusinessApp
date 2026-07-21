import { useCallback } from 'react';

import { apiClient, Order } from '@/src/api/client';
import { DataListScreen } from '@/src/components/DataListScreen';

export default function OrdersScreen() {
  const fetcher = useCallback(() => apiClient.getOrders(), []);

  return (
    <DataListScreen<Order>
      title="Orders"
      fetcher={fetcher}
      keyExtractor={(item) => item.id}
      renderItem={(item) => `${item.status} — ${item.currency} ${item.totalAmount}`}
      emptyMessage="No orders yet."
    />
  );
}
