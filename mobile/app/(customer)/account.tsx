import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { spacing, typography } from '@/constants/theme';
import { useAuth } from '@/src/auth/AuthContext';
import { colorFor, initialsFor } from '@/src/marketplace/avatar';

export default function CustomerAccountScreen() {
  const { session, logout } = useAuth();
  const customerSession = session?.kind === 'customer' ? session : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      {customerSession && (
        <Section title="Profile">
          <View style={styles.profileRow} lightColor="transparent" darkColor="transparent">
            <View style={[styles.avatar, { backgroundColor: colorFor(customerSession.name ?? customerSession.email) }]}>
              <Text style={styles.avatarText}>{initialsFor(customerSession.name ?? customerSession.email)}</Text>
            </View>
            <View lightColor="transparent" darkColor="transparent">
              {customerSession.name && <Text style={styles.name}>{customerSession.name}</Text>}
              <Text style={styles.email}>{customerSession.email}</Text>
            </View>
          </View>
        </Section>
      )}
      <Button label="Log out" variant="destructive" onPress={logout} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24, paddingHorizontal: 16 },
  title: typography.title,
  separator: { marginTop: 12, marginBottom: 12, height: 1, width: '100%' },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  name: { fontSize: 16, fontWeight: '600' },
  email: { fontSize: 13, opacity: 0.6, marginTop: 2 },
});
