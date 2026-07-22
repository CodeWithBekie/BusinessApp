import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/src/auth/AuthContext';

// FR1/Section 19 step 1 — "A business can sign up and create a workspace (tenant)." Gates the
// whole app (see app/_layout.tsx): rendered instead of the tab navigator whenever there's no
// session. After signup/login, the owner lands in the already-built dashboard tabs to do the rest
// of onboarding (catalog, WhatsApp connect, documents — Settings tab) with screens that already
// exist, rather than a separate guided wizard.
export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const auth = useAuth();

  const inputStyle = useInputStyle();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [industryType, setIndustryType] = useState('retail');
  const [ownerName, setOwnerName] = useState('');

  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setStatus('submitting');
    setError(null);
    try {
      if (mode === 'login') {
        await auth.login(email.trim(), password);
      } else {
        if (!businessName.trim() || !ownerName.trim()) {
          throw new Error('Business name and owner name are required.');
        }
        await auth.signup(businessName.trim(), industryType.trim() || 'retail', ownerName.trim(), email.trim(), password);
      }
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
      return;
    }
    setStatus('idle');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{mode === 'login' ? 'Log in' : 'Create your business'}</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      {mode === 'signup' && (
        <>
          <TextInput style={inputStyle} placeholder="Business name" value={businessName} onChangeText={setBusinessName} />
          <TextInput style={inputStyle} placeholder="Industry type" value={industryType} onChangeText={setIndustryType} autoCapitalize="none" />
          <TextInput style={inputStyle} placeholder="Your name" value={ownerName} onChangeText={setOwnerName} />
        </>
      )}

      <TextInput
        style={inputStyle}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput style={inputStyle} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />

      <Pressable style={styles.button} disabled={status === 'submitting'} onPress={submit}>
        {status === 'submitting' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{mode === 'login' ? 'Log in' : 'Sign up'}</Text>
        )}
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable onPress={() => setMode(mode === 'login' ? 'signup' : 'login')} style={styles.toggle}>
        <Text style={styles.toggleText}>
          {mode === 'login' ? "Don't have a business account? Sign up" : 'Already have an account? Log in'}
        </Text>
      </Pressable>
    </View>
  );
}

function useInputStyle() {
  const colorScheme = useColorScheme();
  return [styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight];
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  separator: { marginVertical: 16, height: 1, width: '100%' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 10,
  },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
  button: { backgroundColor: '#007aff', paddingVertical: 12, borderRadius: 6, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#c0392b', marginTop: 12, textAlign: 'center' },
  toggle: { marginTop: 20 },
  toggleText: { textAlign: 'center', color: '#007aff' },
});
