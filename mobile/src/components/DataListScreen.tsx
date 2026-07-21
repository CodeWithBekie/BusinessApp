import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

interface DataListScreenProps<T> {
  title: string;
  fetcher: () => Promise<T[]>;
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => string;
  emptyMessage?: string;
}

// Shared placeholder-list pattern for the Catalog/Orders/Approvals dashboard tabs (Phase 0):
// fetch, show loading/error/empty states, render a flat list of strings. Replace with real
// per-screen UI once the Api's endpoints return more than empty/seed data (Phase 1+).
export function DataListScreen<T>({ title, fetcher, keyExtractor, renderItem, emptyMessage }: DataListScreenProps<T>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetcher()
      .then((data) => {
        if (isMounted) setItems(data);
      })
      .catch((err: Error) => {
        if (isMounted) setError(err.message);
      });
    return () => {
      isMounted = false;
    };
  }, [fetcher]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {!error && items === null && <ActivityIndicator />}
      {!error && items !== null && items.length === 0 && <Text>{emptyMessage ?? 'Nothing here yet.'}</Text>}
      {!error && items !== null && items.length > 0 && (
        <FlatList
          style={styles.list}
          data={items}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => <Text style={styles.row}>{renderItem(item)}</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24, paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: 'bold' },
  separator: { marginVertical: 16, height: 1, width: '100%' },
  list: { width: '100%' },
  row: { paddingVertical: 8 },
  error: { color: '#c0392b' },
});
