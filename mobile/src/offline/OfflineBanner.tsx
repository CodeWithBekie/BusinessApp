import { StyleSheet } from 'react-native';

import { Text } from '@/components/Themed';
import { useIsOnline } from '@/src/offline/networkStatus';

export function OfflineBanner() {
  const isOnline = useIsOnline();

  if (isOnline) {
    return null;
  }

  return (
    <Text style={styles.banner} lightColor="#fff" darkColor="#fff">
      You're offline — showing saved data
    </Text>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#c0392b',
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 6,
  },
});
