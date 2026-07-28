import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/src/auth/AuthContext';
import CustomerAuthScreen from '@/src/auth/CustomerAuthScreen';

// FR1/Section 19 step 1 — "A business can sign up and create a workspace (tenant)." Gates the
// whole app (see app/_layout.tsx): rendered instead of the tab navigator whenever there's no
// session. After signup/login, the owner lands in the already-built dashboard tabs to do the rest
// of onboarding (catalog, WhatsApp connect, documents — Settings tab) with screens that already
// exist, rather than a separate guided wizard.
//
// A "Business owner" vs "I'm shopping" picker gates this business form and the sibling
// CustomerAuthScreen — the two are otherwise-unrelated identities (see AuthContext's
// business/customer session kinds), so this is just a router between them, not a shared form.
export default function AuthScreen() {
  const [kind, setKind] = useState<'business' | 'customer' | null>(null);

  if (kind === 'customer') {
    return <CustomerAuthScreen onBack={() => setKind(null)} />;
  }

  if (kind === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Welcome</Text>
        <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
        <Pressable style={styles.button} onPress={() => setKind('business')}>
          <Text style={styles.buttonText}>I'm a business owner</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => setKind('customer')}>
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>I'm shopping</Text>
        </Pressable>
      </View>
    );
  }

  return <BusinessAuthForm onBack={() => setKind(null)} />;
}

function BusinessAuthForm({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'accept-invite'>('login');
  const auth = useAuth();

  const inputStyle = useInputStyle();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [industryType, setIndustryType] = useState('retail');
  const [ownerName, setOwnerName] = useState('');
  const [inviteToken, setInviteToken] = useState('');

  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setStatus('submitting');
    setError(null);
    try {
      if (mode === 'login') {
        await auth.login(email.trim(), password);
      } else if (mode === 'signup') {
        if (!businessName.trim() || !ownerName.trim()) {
          throw new Error('Business name and owner name are required.');
        }
        await auth.signup(businessName.trim(), industryType.trim() || 'retail', ownerName.trim(), email.trim(), password);
      } else {
        if (!inviteToken.trim() || !password) {
          throw new Error('Invite code and password are required.');
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        await auth.acceptInvite(inviteToken.trim().toUpperCase(), password);
      }
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
      return;
    }
    setStatus('idle');
  };

  const titles: Record<typeof mode, string> = {
    login: 'Log in',
    signup: 'Create your business',
    'accept-invite': 'Accept your invite',
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>{titles[mode]}</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      {mode === 'signup' && (
        <>
          <TextInput style={inputStyle} placeholder="Business name" value={businessName} onChangeText={setBusinessName} />
          <TextInput style={inputStyle} placeholder="Industry type" value={industryType} onChangeText={setIndustryType} autoCapitalize="none" />
          <TextInput style={inputStyle} placeholder="Your name" value={ownerName} onChangeText={setOwnerName} />
        </>
      )}

      {mode === 'accept-invite' && (
        <TextInput
          style={inputStyle}
          placeholder="Invite code"
          value={inviteToken}
          onChangeText={setInviteToken}
          autoCapitalize="characters"
        />
      )}

      {mode !== 'accept-invite' && (
        <TextInput
          style={inputStyle}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      )}
      <TextInput style={inputStyle} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      {mode === 'accept-invite' && (
        <TextInput
          style={inputStyle}
          placeholder="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />
      )}

      <Pressable style={styles.button} disabled={status === 'submitting'} onPress={submit}>
        {status === 'submitting' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{mode === 'login' ? 'Log in' : mode === 'signup' ? 'Sign up' : 'Accept invite'}</Text>
        )}
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      {mode !== 'accept-invite' && (
        <Pressable onPress={() => setMode(mode === 'login' ? 'signup' : 'login')} style={styles.toggle}>
          <Text style={styles.toggleText}>
            {mode === 'login' ? "Don't have a business account? Sign up" : 'Already have an account? Log in'}
          </Text>
        </Pressable>
      )}
      <Pressable onPress={() => setMode(mode === 'accept-invite' ? 'login' : 'accept-invite')} style={styles.toggle}>
        <Text style={styles.toggleText}>
          {mode === 'accept-invite' ? '← Back to log in' : 'Have a staff invite code? Enter it here'}
        </Text>
      </Pressable>
    </View>
  );
}

export function useInputStyle() {
  const colorScheme = useColorScheme();
  return [styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight];
}

export const styles = StyleSheet.create({
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
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#007aff' },
  buttonText: { color: '#fff', fontWeight: '600' },
  secondaryButtonText: { color: '#007aff' },
  error: { color: '#c0392b', marginTop: 12, textAlign: 'center' },
  toggle: { marginTop: 20 },
  toggleText: { textAlign: 'center', color: '#007aff' },
  back: { position: 'absolute', top: 24, left: 0 },
  backText: { color: '#007aff', fontWeight: '600' },
});
