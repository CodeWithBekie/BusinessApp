import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';

import { apiClient, PublicBusinessSummary } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { semanticColors, spacing } from '@/constants/theme';
import { colorFor, industryIconFor, initialsFor } from '@/src/marketplace/avatar';
import { useCachedFetch } from '@/src/offline/useCachedFetch';

function BusinessAvatar({ business }: { business: PublicBusinessSummary }) {
  return (
    <View style={[styles.avatar, { backgroundColor: colorFor(business.name) }]} lightColor="transparent" darkColor="transparent">
      <Text style={styles.avatarText}>{initialsFor(business.name)}</Text>
      <View style={styles.industryBadge} lightColor="#fff" darkColor="#1c1c1e">
        <Icon name={industryIconFor(business.industryType)} size={11} color={colorFor(business.name)} />
      </View>
    </View>
  );
}

function BusinessCard({ business, onPress }: { business: PublicBusinessSummary; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cardWrapper, pressed && styles.cardPressed]}>
      <Card style={styles.cardInner}>
        <BusinessAvatar business={business} />
        <View style={styles.cardText} lightColor="transparent" darkColor="transparent">
          <Text style={styles.name} numberOfLines={1}>
            {business.name}
          </Text>
          <Text style={styles.meta}>{business.industryType}</Text>
        </View>
        <View style={styles.currencyChip} lightColor="#f2f2f7" darkColor="rgba(255,255,255,0.1)">
          <Text style={styles.currencyText}>{business.currency}</Text>
        </View>
      </Card>
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
      {!error && businesses === null && <ActivityIndicator style={styles.loadingCentered} />}
      {!error && businesses !== null && businesses.length === 0 && (
        <View style={styles.emptyState} lightColor="transparent" darkColor="transparent">
          <Icon name="storefront" color={semanticColors.neutral} size={48} />
          <Text style={styles.empty}>No businesses are listed yet — check back soon.</Text>
        </View>
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
  loadingCentered: { flex: 1, justifyContent: 'center' },
  empty: { opacity: 0.6, marginTop: 12, textAlign: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  error: { color: semanticColors.danger, marginBottom: 12 },
  cacheNote: { opacity: 0.6, fontSize: 12, marginBottom: 12 },
  list: { width: '100%' },
  cardWrapper: { marginBottom: spacing.md },
  cardPressed: { opacity: 0.7 },
  cardInner: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  industryBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, marginLeft: 12, marginRight: 8 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, opacity: 0.6, marginTop: 3, textTransform: 'capitalize' },
  currencyChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  currencyText: { fontSize: 11, fontWeight: '700', opacity: 0.7 },
});
