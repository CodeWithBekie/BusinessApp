import { Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAuth } from '@/src/auth/AuthContext';

export default function CustomerAccountScreen() {
  const { session, logout } = useAuth();
  const customerSession = session?.kind === 'customer' ? session : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      {customerSession && (
        <View style={styles.card} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
          {customerSession.name && <Text style={styles.name}>{customerSession.name}</Text>}
          <Text style={styles.email}>{customerSession.email}</Text>
        </View>
      )}
      <Pressable style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutButtonText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24, paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: 'bold' },
  separator: { marginTop: 12, marginBottom: 12, height: 1, width: '100%' },
  card: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 16, marginBottom: 24 },
  name: { fontSize: 16, fontWeight: '600' },
  email: { fontSize: 13, opacity: 0.6, marginTop: 2 },
  logoutButton: { borderWidth: 1, borderColor: '#c0392b', paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  logoutButtonText: { color: '#c0392b', fontWeight: '600' },
});
