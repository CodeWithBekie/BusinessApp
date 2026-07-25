import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';

import { apiClient, PublicBusinessSummary } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useCachedFetch } from '@/src/offline/useCachedFetch';

function BusinessCard({ business, onPress }: { business: PublicBusinessSummary; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.cardInner} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
        <Text style={styles.name} numberOfLines={1}>
          {business.name}
        </Text>
        <Text style={styles.meta}>
          {business.industryType} · {business.currency}
        </Text>
      </View>
    </Pressable>
  );
}

export default function BrowseBusinessesScreen() {
  const router = useRouter();
  const fetchBusinesses = useCallback(() => apiClient.getMarketplaceBusinesses(), []);
  const { data: businesses, error, refreshing, isFromCache, reload: load } = useCachedFetch<PublicBusinessSummary[]>(
    'marketplace:businesses',
    fetchBusinesses
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Browse businesses</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      {error && <Text style={styles.error}>Could not reach the API: {error}</Text>}
      {isFromCache && <Text style={styles.cacheNote}>Showing saved data</Text>}
      {!error && businesses === null && <ActivityIndicator style={styles.loading} />}
      {!error && businesses !== null && businesses.length === 0 && (
        <Text style={styles.empty}>No businesses are listed yet — check back soon.</Text>
      )}
      {!error && businesses !== null && businesses.length > 0 && (
        <FlatList
          style={styles.list}
          data={businesses}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <BusinessCard business={item} onPress={() => router.push({ pathname: '/business/[id]', params: { id: item.id } })} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24, paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: 'bold' },
  separator: { marginTop: 12, marginBottom: 12, height: 1, width: '100%' },
  loading: { marginTop: 24 },
  empty: { opacity: 0.6, marginTop: 8 },
  error: { color: '#c0392b', marginBottom: 12 },
  cacheNote: { opacity: 0.6, fontSize: 12, marginBottom: 12 },
  list: { width: '100%' },
  card: { marginBottom: 12, borderRadius: 10 },
  cardPressed: { opacity: 0.7 },
  cardInner: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 14 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, opacity: 0.6, marginTop: 4, textTransform: 'capitalize' },
});
