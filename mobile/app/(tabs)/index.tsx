import { useCallback } from 'react';

import { apiClient, CatalogItem } from '@/src/api/client';
import { DataListScreen } from '@/src/components/DataListScreen';

export default function CatalogScreen() {
  const fetcher = useCallback(() => apiClient.getCatalog(), []);

  return (
    <DataListScreen<CatalogItem>
      title="Catalog"
      fetcher={fetcher}
      keyExtractor={(item) => item.id}
      renderItem={(item) => `${item.name} — ${item.currency} ${item.price} (stock: ${item.stockQuantity ?? 'n/a'})`}
      emptyMessage="No catalog items yet."
    />
  );
}
