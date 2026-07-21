import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { apiClient, SalesSummary } from '@/src/api/client';
import { Text, View } from '@/components/Themed';

export default function SalesScreen() {
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    apiClient
      .getSalesSummary()
      .then((data) => {
        if (isMounted) setSummary(data);
      })
      .catch((err: Error) => {
        if (isMounted) setError(err.message);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sales</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {!error && !summary && <ActivityIndicator />}
      {!error && summary && (
        <View style={styles.tiles}>
          <View style={styles.tile}>
            <Text style={styles.tileValue}>{summary.totalOrders}</Text>
            <Text style={styles.tileLabel}>Paid orders</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileValue}>{summary.totalAmount}</Text>
            <Text style={styles.tileLabel}>Total revenue</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24, paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: 'bold' },
  separator: { marginVertical: 16, height: 1, width: '100%' },
  error: { color: '#c0392b' },
  tiles: { flexDirection: 'row', gap: 16 },
  tile: { flex: 1, alignItems: 'center', paddingVertical: 24, borderWidth: 1, borderColor: '#ccc', borderRadius: 8 },
  tileValue: { fontSize: 28, fontWeight: 'bold' },
  tileLabel: { marginTop: 4 },
});
