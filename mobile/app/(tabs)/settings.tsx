import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { apiClient } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/src/auth/AuthContext';

// Section 12.3/19 — stand-in for Meta's real embedded-signup/OAuth flow: the owner pastes in
// values obtained directly from their Meta dashboard. See WhatsAppOptions/WhatsAppConnectRequest
// on the Api side.
function WhatsAppConnectForm() {
  const inputStyle = useInputStyle();
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [systemUserToken, setSystemUserToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error' | 'saved'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (!wabaId.trim() || !phoneNumberId.trim() || !systemUserToken.trim()) {
      setStatus('error');
      setMessage('All three fields are required.');
      return;
    }
    setStatus('saving');
    setMessage(null);
    try {
      const connection = await apiClient.connectWhatsApp(wabaId.trim(), phoneNumberId.trim(), systemUserToken.trim());
      setStatus('saved');
      setMessage(`Connected — status: ${connection.status}`);
    } catch (err) {
      setStatus('error');
      setMessage((err as Error).message);
    }
  };

  return (
    <View style={styles.card} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
      <Text style={styles.cardTitle}>WhatsApp connection</Text>
      <Text style={styles.cardSubtitle}>Paste in values from your Meta developer dashboard.</Text>
      <TextInput style={inputStyle} placeholder="WABA ID" value={wabaId} onChangeText={setWabaId} autoCapitalize="none" />
      <TextInput
        style={inputStyle}
        placeholder="Phone Number ID"
        value={phoneNumberId}
        onChangeText={setPhoneNumberId}
        autoCapitalize="none"
      />
      <TextInput
        style={inputStyle}
        placeholder="System User Token"
        value={systemUserToken}
        onChangeText={setSystemUserToken}
        autoCapitalize="none"
        secureTextEntry
      />
      <Pressable style={styles.button} disabled={status === 'saving'} onPress={submit}>
        <Text style={styles.buttonText}>{status === 'saving' ? 'Connecting…' : 'Connect'}</Text>
      </Pressable>
      {message && <Text style={status === 'error' ? styles.error : styles.success}>{message}</Text>}
    </View>
  );
}

// Section 13.2 — connects the business's own Paynow merchant integration for Express Checkout
// (EcoCash/Bank) payments. See PaynowConnectRequest on the Api side.
function PaynowConnectForm() {
  const inputStyle = useInputStyle();
  const [integrationId, setIntegrationId] = useState('');
  const [integrationKey, setIntegrationKey] = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error' | 'saved'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (!integrationId.trim() || !integrationKey.trim() || !notificationEmail.trim()) {
      setStatus('error');
      setMessage('All three fields are required.');
      return;
    }
    setStatus('saving');
    setMessage(null);
    try {
      await apiClient.connectPaynow(integrationId.trim(), integrationKey.trim(), notificationEmail.trim());
      setStatus('saved');
      setMessage('Connected.');
    } catch (err) {
      setStatus('error');
      setMessage((err as Error).message);
    }
  };

  return (
    <View style={styles.card} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
      <Text style={styles.cardTitle}>Paynow connection</Text>
      <Text style={styles.cardSubtitle}>Paste in your Integration ID and Key from your Paynow merchant dashboard.</Text>
      <TextInput style={inputStyle} placeholder="Integration ID" value={integrationId} onChangeText={setIntegrationId} autoCapitalize="none" />
      <TextInput
        style={inputStyle}
        placeholder="Integration Key"
        value={integrationKey}
        onChangeText={setIntegrationKey}
        autoCapitalize="none"
        secureTextEntry
      />
      <TextInput
        style={inputStyle}
        placeholder="Notification email"
        value={notificationEmail}
        onChangeText={setNotificationEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Pressable style={styles.button} disabled={status === 'saving'} onPress={submit}>
        <Text style={styles.buttonText}>{status === 'saving' ? 'Connecting…' : 'Connect'}</Text>
      </Pressable>
      {message && <Text style={status === 'error' ? styles.error : styles.success}>{message}</Text>}
    </View>
  );
}

// Section 10.6/12.3 — document upload for RAG. Plain-text body only this pass (matches the Api).
function DocumentUploadForm() {
  const inputStyle = useInputStyle();
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState('text');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error' | 'saved'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim() || !content.trim()) {
      setStatus('error');
      setMessage('Title and content are required.');
      return;
    }
    setStatus('saving');
    setMessage(null);
    try {
      const result = await apiClient.ingestDocument(title.trim(), content.trim(), sourceType.trim() || 'text');
      setStatus('saved');
      setMessage(`Ingested ${result.chunkCount} chunk(s).`);
      setTitle('');
      setContent('');
    } catch (err) {
      setStatus('error');
      setMessage((err as Error).message);
    }
  };

  return (
    <View style={styles.card} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
      <Text style={styles.cardTitle}>Upload a policy/FAQ document</Text>
      <Text style={styles.cardSubtitle}>Grounds the assistant's answers to policy questions (return policy, delivery areas, hours, etc.).</Text>
      <TextInput style={inputStyle} placeholder="Title" value={title} onChangeText={setTitle} />
      <TextInput style={inputStyle} placeholder="Source type (e.g. text)" value={sourceType} onChangeText={setSourceType} autoCapitalize="none" />
      <TextInput
        style={[inputStyle, styles.textArea]}
        placeholder="Document content"
        value={content}
        onChangeText={setContent}
        multiline
        numberOfLines={6}
      />
      <Pressable style={styles.button} disabled={status === 'saving'} onPress={submit}>
        <Text style={styles.buttonText}>{status === 'saving' ? 'Uploading…' : 'Upload'}</Text>
      </Pressable>
      {message && <Text style={status === 'error' ? styles.error : styles.success}>{message}</Text>}
    </View>
  );
}

function useInputStyle() {
  const colorScheme = useColorScheme();
  return [styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight];
}

export default function SettingsScreen() {
  const auth = useAuth();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <WhatsAppConnectForm />
      <PaynowConnectForm />
      <DocumentUploadForm />
      <Pressable style={styles.logoutButton} onPress={auth.logout}>
        <Text style={styles.logoutButtonText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 24, paddingHorizontal: 16, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: 'bold' },
  separator: { marginVertical: 16, height: 1, width: '100%' },
  card: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSubtitle: { fontSize: 12, opacity: 0.6, marginTop: 2, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  button: { backgroundColor: '#007aff', paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#c0392b', marginTop: 8 },
  success: { color: '#2e7d32', marginTop: 8 },
  logoutButton: { borderWidth: 1, borderColor: '#c0392b', paddingVertical: 10, borderRadius: 6, alignItems: 'center', marginBottom: 32 },
  logoutButtonText: { color: '#c0392b', fontWeight: '600' },
});
