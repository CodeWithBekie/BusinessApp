import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useAuth } from '@/src/auth/AuthContext';
import { styles, useInputStyle } from '@/src/auth/authFormStyles';

// Sibling to the business login/signup form in AuthScreen.tsx — same visual shape, different
// fields/identity (a marketplace CustomerAccount, not a BusinessUser). Kept as its own component
// rather than branching inside AuthScreen's form so the two flows don't get tangled together.
export default function CustomerAuthScreen({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const auth = useAuth();

  const inputStyle = useInputStyle();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setStatus('submitting');
    setError(null);
    try {
      if (mode === 'login') {
        await auth.customerLogin(email.trim(), password);
      } else {
        await auth.customerSignup(email.trim(), password, name.trim() || undefined, phoneNumber.trim() || undefined);
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
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>{mode === 'login' ? 'Log in' : 'Create your account'}</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      {mode === 'signup' && (
        <>
          <TextInput style={inputStyle} placeholder="Your name (optional)" value={name} onChangeText={setName} />
          <TextInput
            style={inputStyle}
            placeholder="Phone number (optional)"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
          />
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
        <Text style={styles.toggleText}>{mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}</Text>
      </Pressable>
    </View>
  );
}
