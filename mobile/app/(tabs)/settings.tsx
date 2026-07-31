import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { apiClient, BusinessUserRole, StaffInviteResult, StaffSummary } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { semanticColors, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/src/auth/AuthContext';
import { useIsOnline } from '@/src/offline/networkStatus';
import { useHasPermission } from '@/src/auth/permissions';

// Section 12.3/19 — stand-in for Meta's real embedded-signup/OAuth flow: the owner pastes in
// values obtained directly from their Meta dashboard. See WhatsAppOptions/WhatsAppConnectRequest
// on the Api side.
function WhatsAppConnectForm() {
  const inputStyle = useInputStyle();
  const isOnline = useIsOnline();
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
    <Card style={styles.card}>
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
      <Button label={status === 'saving' ? 'Connecting…' : 'Connect'} disabled={status === 'saving' || !isOnline} onPress={submit} />
      {message && <Text style={status === 'error' ? styles.error : styles.success}>{message}</Text>}
      {!isOnline && <Text style={styles.error}>You're offline — connect to save.</Text>}
    </Card>
  );
}

// Section 13.2 — connects the business's own Paynow merchant integration for Express Checkout
// (EcoCash/Bank) payments. See PaynowConnectRequest on the Api side.
function PaynowConnectForm() {
  const inputStyle = useInputStyle();
  const isOnline = useIsOnline();
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
    <Card style={styles.card}>
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
      <Button label={status === 'saving' ? 'Connecting…' : 'Connect'} disabled={status === 'saving' || !isOnline} onPress={submit} />
      {message && <Text style={status === 'error' ? styles.error : styles.success}>{message}</Text>}
      {!isOnline && <Text style={styles.error}>You're offline — connect to save.</Text>}
    </Card>
  );
}

// Real EcoCash Instant Payment sandbox integration — a genuine alternate gateway alongside Paynow
// above, not a replacement. See EcoCashConnectRequest on the Api side.
function EcoCashConnectForm() {
  const inputStyle = useInputStyle();
  const isOnline = useIsOnline();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [merchantCode, setMerchantCode] = useState('');
  const [merchantPin, setMerchantPin] = useState('');
  const [merchantNumber, setMerchantNumber] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [superMerchantName, setSuperMerchantName] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error' | 'saved'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (!username.trim() || !password.trim() || !merchantCode.trim() || !merchantPin.trim() || !merchantNumber.trim()) {
      setStatus('error');
      setMessage('Username, password, merchant code, merchant PIN, and merchant number are required.');
      return;
    }
    setStatus('saving');
    setMessage(null);
    try {
      await apiClient.connectEcoCash({
        username: username.trim(),
        password: password.trim(),
        merchantCode: merchantCode.trim(),
        merchantPin: merchantPin.trim(),
        merchantNumber: merchantNumber.trim(),
        merchantName: merchantName.trim(),
        superMerchantName: superMerchantName.trim(),
      });
      setStatus('saved');
      setMessage('Connected.');
    } catch (err) {
      setStatus('error');
      setMessage((err as Error).message);
    }
  };

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>EcoCash connection</Text>
      <Text style={styles.cardSubtitle}>Paste in your EcoCash Instant Payment sandbox credentials.</Text>
      <TextInput style={inputStyle} placeholder="Username" value={username} onChangeText={setUsername} autoCapitalize="none" />
      <TextInput style={inputStyle} placeholder="Password" value={password} onChangeText={setPassword} autoCapitalize="none" secureTextEntry />
      <TextInput style={inputStyle} placeholder="Merchant code" value={merchantCode} onChangeText={setMerchantCode} autoCapitalize="none" />
      <TextInput style={inputStyle} placeholder="Merchant PIN" value={merchantPin} onChangeText={setMerchantPin} autoCapitalize="none" secureTextEntry />
      <TextInput style={inputStyle} placeholder="Merchant number" value={merchantNumber} onChangeText={setMerchantNumber} autoCapitalize="none" />
      <TextInput style={inputStyle} placeholder="Merchant name" value={merchantName} onChangeText={setMerchantName} autoCapitalize="none" />
      <TextInput style={inputStyle} placeholder="Super merchant name" value={superMerchantName} onChangeText={setSuperMerchantName} autoCapitalize="none" />
      <Button label={status === 'saving' ? 'Connecting…' : 'Connect'} disabled={status === 'saving' || !isOnline} onPress={submit} />
      {message && <Text style={status === 'error' ? styles.error : styles.success}>{message}</Text>}
      {!isOnline && <Text style={styles.error}>You're offline — connect to save.</Text>}
    </Card>
  );
}

// Section 10.6/12.3 — document upload for RAG. Plain-text body only this pass (matches the Api).
function DocumentUploadForm() {
  const inputStyle = useInputStyle();
  const isOnline = useIsOnline();
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
    <Card style={styles.card}>
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
      <Button label={status === 'saving' ? 'Uploading…' : 'Upload'} disabled={status === 'saving' || !isOnline} onPress={submit} />
      {message && <Text style={status === 'error' ? styles.error : styles.success}>{message}</Text>}
      {!isOnline && <Text style={styles.error}>You're offline — connect to upload.</Text>}
    </Card>
  );
}

// Opt-in toggle for the customer marketplace directory — businesses stay hidden by default
// (see Business.IsPubliclyListed on the Api side) until an owner explicitly lists themselves.
// No GET endpoint exists for the current value yet, so this starts optimistically at "off" and
// reflects whatever the PATCH response confirms — simplest for this first pass (per the plan).
function BusinessVisibilityForm() {
  const isOnline = useIsOnline();
  const [isPubliclyListed, setIsPubliclyListed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (value: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const result = await apiClient.setBusinessVisibility(value);
      setIsPubliclyListed(result.isPubliclyListed);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>Customer marketplace</Text>
      <Text style={styles.cardSubtitle}>List your business so customers can browse and order from you in the app.</Text>
      <View style={styles.toggleRow} lightColor="transparent" darkColor="transparent">
        <Text style={styles.toggleLabel}>{isPubliclyListed ? 'Listed' : 'Not listed'}</Text>
        <Switch value={isPubliclyListed} onValueChange={toggle} disabled={saving || !isOnline} />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {!isOnline && <Text style={styles.error}>You're offline — connect to change this.</Text>}
    </Card>
  );
}

// Fiscal-invoice/VAT settings the owner fills in themselves — blank by default, printed on the
// invoice PDF only if set (see DocumentGenerationTools.cs's BuildOrderInvoiceDocument). vatRate is
// stored/sent as a decimal fraction (0.15) but edited here as a percentage (15) for readability.
function BusinessDetailsForm() {
  const inputStyle = useInputStyle();
  const isOnline = useIsOnline();
  const [tin, setTin] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [vatRatePercent, setVatRatePercent] = useState('0');
  const [deviceSerialNumber, setDeviceSerialNumber] = useState('');
  const [fiscalDeviceId, setFiscalDeviceId] = useState('');
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'error' | 'saved'>('loading');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getBusiness()
      .then((business) => {
        if (cancelled) return;
        setTin(business.tin ?? '');
        setVatNumber(business.vatNumber ?? '');
        setAddress(business.address ?? '');
        setEmail(business.email ?? '');
        setPhone(business.phone ?? '');
        setVatRatePercent(String(business.vatRate * 100));
        setDeviceSerialNumber(business.deviceSerialNumber ?? '');
        setFiscalDeviceId(business.fiscalDeviceId ?? '');
        setStatus('idle');
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('error');
        setMessage((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    const parsedPercent = Number(vatRatePercent);
    if (Number.isNaN(parsedPercent) || parsedPercent < 0 || parsedPercent > 100) {
      setStatus('error');
      setMessage('VAT rate must be a number between 0 and 100.');
      return;
    }
    setStatus('saving');
    setMessage(null);
    try {
      await apiClient.updateBusiness({
        tin: tin.trim() || null,
        vatNumber: vatNumber.trim() || null,
        address: address.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        vatRate: parsedPercent / 100,
        deviceSerialNumber: deviceSerialNumber.trim() || null,
        fiscalDeviceId: fiscalDeviceId.trim() || null,
      });
      setStatus('saved');
      setMessage('Saved.');
    } catch (err) {
      setStatus('error');
      setMessage((err as Error).message);
    }
  };

  if (status === 'loading') {
    return (
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Business details</Text>
        <Text style={styles.cardSubtitle}>Loading…</Text>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>Business details</Text>
      <Text style={styles.cardSubtitle}>Used on your invoices/receipts. Leave a field blank to omit it from the PDF.</Text>
      <TextInput style={inputStyle} placeholder="TIN" value={tin} onChangeText={setTin} autoCapitalize="none" />
      <TextInput style={inputStyle} placeholder="VAT No" value={vatNumber} onChangeText={setVatNumber} autoCapitalize="none" />
      <TextInput style={inputStyle} placeholder="Address" value={address} onChangeText={setAddress} multiline />
      <TextInput style={inputStyle} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextInput style={inputStyle} placeholder="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <TextInput
        style={inputStyle}
        placeholder="VAT rate (%)"
        value={vatRatePercent}
        onChangeText={setVatRatePercent}
        keyboardType="decimal-pad"
      />
      <TextInput style={inputStyle} placeholder="Device Serial No" value={deviceSerialNumber} onChangeText={setDeviceSerialNumber} autoCapitalize="none" />
      <TextInput style={inputStyle} placeholder="Fiscal Device ID" value={fiscalDeviceId} onChangeText={setFiscalDeviceId} autoCapitalize="none" />
      <Button label={status === 'saving' ? 'Saving…' : 'Save'} disabled={status === 'saving' || !isOnline} onPress={submit} />
      {message && <Text style={status === 'error' ? styles.error : styles.success}>{message}</Text>}
      {!isOnline && <Text style={styles.error}>You're offline — connect to save.</Text>}
    </Card>
  );
}

const INVITABLE_ROLES: readonly { value: BusinessUserRole; label: string }[] = [
  { value: 'Manager', label: 'Manager' },
  { value: 'Cashier', label: 'Cashier' },
  { value: 'InventoryClerk', label: 'Inventory Clerk' },
  { value: 'Accountant', label: 'Accountant' },
];

const ROLE_LABELS: Record<BusinessUserRole, string> = {
  Owner: 'Owner',
  Manager: 'Manager',
  Cashier: 'Cashier',
  InventoryClerk: 'Inventory Clerk',
  Accountant: 'Accountant',
};

// Owner-only staff roster (Permission.ManageStaff) — no invite-email flow exists in this codebase
// (WhatsApp/Paynow connections above are also pasted-in manually), so the Owner sets the new staff
// member's initial password directly, same as StaffTools.InviteStaffAsync on the server.
function StaffManagementForm() {
  const inputStyle = useInputStyle();
  const isOnline = useIsOnline();
  const { session } = useAuth();
  const currentUserId = session?.kind === 'business' ? session.businessUserId : null;

  const [staff, setStaff] = useState<StaffSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<BusinessUserRole>('Cashier');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<StaffInviteResult | null>(null);

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadStaff = () => {
    apiClient
      .getStaff()
      .then(setStaff)
      .catch((err) => setListError((err as Error).message));
  };

  useEffect(loadStaff, []);

  const invite = async () => {
    setInviteError(null);
    if (!name.trim() || !email.trim()) {
      setInviteError('Name and email are required.');
      return;
    }
    setInviting(true);
    try {
      const result = await apiClient.inviteStaff({ name: name.trim(), email: email.trim(), role });
      setName('');
      setEmail('');
      setRole('Cashier');
      setInviteResult(result);
      loadStaff();
    } catch (err) {
      setInviteError((err as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const resendInvite = async (member: StaffSummary) => {
    setUpdatingId(member.id);
    try {
      const result = await apiClient.resendStaffInvite(member.id);
      setInviteResult(result);
      loadStaff();
    } catch (err) {
      setListError((err as Error).message);
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleActive = async (member: StaffSummary) => {
    setUpdatingId(member.id);
    try {
      await apiClient.updateStaff(member.id, { isActive: !member.isActive });
      loadStaff();
    } catch (err) {
      setListError((err as Error).message);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>Staff</Text>
      <Text style={styles.cardSubtitle}>
        Invite employees and manage their role. There's no email sending yet — share the invite code shown after inviting.
      </Text>

      {inviteResult && (
        <View style={styles.inviteResultCard} lightColor="#eef6ff" darkColor="rgba(0,122,255,0.12)">
          <Text style={styles.inviteResultTitle}>Share this with {inviteResult.staff.name}</Text>
          <Text style={styles.inviteResultCode} selectable>
            {inviteResult.inviteToken}
          </Text>
          <Text style={styles.inviteResultLink} selectable>
            {inviteResult.inviteLink}
          </Text>
          <Pressable onPress={() => setInviteResult(null)} style={styles.inviteResultDismiss}>
            <Text style={styles.inviteResultDismissText}>Dismiss</Text>
          </Pressable>
        </View>
      )}

      {listError && <Text style={styles.error}>{listError}</Text>}
      {staff?.map((member) => (
        <View key={member.id} style={styles.staffRow} lightColor="transparent" darkColor="transparent">
          <View style={styles.staffInfo} lightColor="transparent" darkColor="transparent">
            <Text style={styles.staffName} numberOfLines={1}>
              {member.name}
              {member.id === currentUserId ? ' (you)' : ''}
            </Text>
            <Text style={styles.staffMeta}>
              {member.email} · {ROLE_LABELS[member.role]}
              {member.status !== 'Active' ? ` · ${member.status}` : ''}
            </Text>
          </View>
          {member.id !== currentUserId && (
            <View style={styles.staffActions} lightColor="transparent" darkColor="transparent">
              {(member.status === 'Pending' || member.status === 'Expired') && (
                <Button
                  label="Resend invite"
                  variant="destructive"
                  style={styles.staffToggleButton}
                  disabled={updatingId === member.id || !isOnline}
                  onPress={() => resendInvite(member)}
                />
              )}
              {(member.status === 'Active' || member.status === 'Deactivated') && (
                <Button
                  label={member.isActive ? 'Deactivate' : 'Reactivate'}
                  variant="destructive"
                  style={styles.staffToggleButton}
                  disabled={updatingId === member.id || !isOnline}
                  onPress={() => toggleActive(member)}
                />
              )}
            </View>
          )}
        </View>
      ))}

      <Text style={[styles.cardSubtitle, styles.staffInviteHeading]}>Invite staff</Text>
      <TextInput style={inputStyle} placeholder="Name" value={name} onChangeText={setName} />
      <TextInput style={inputStyle} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <View style={styles.roleRow} lightColor="transparent" darkColor="transparent">
        {INVITABLE_ROLES.map((option) => (
          <Chip key={option.value} label={option.label} active={option.value === role} onPress={() => setRole(option.value)} />
        ))}
      </View>
      <Button label={inviting ? 'Inviting…' : 'Invite staff member'} disabled={inviting || !isOnline} onPress={invite} />
      {inviteError && <Text style={styles.error}>{inviteError}</Text>}
      {!isOnline && <Text style={styles.error}>You're offline — connect to manage staff.</Text>}
    </Card>
  );
}

function useInputStyle() {
  const colorScheme = useColorScheme();
  return [styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight];
}

export default function SettingsScreen() {
  const auth = useAuth();
  const canManageBusinessSettings = useHasPermission('ManageBusinessSettings');
  const canManageStaff = useHasPermission('ManageStaff');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      {canManageStaff && <StaffManagementForm />}
      {canManageBusinessSettings && (
        <>
          <BusinessVisibilityForm />
          <BusinessDetailsForm />
          <WhatsAppConnectForm />
          <PaynowConnectForm />
          <EcoCashConnectForm />
          <DocumentUploadForm />
        </>
      )}
      <Button label="Log out" variant="destructive" style={styles.logoutButton} onPress={auth.logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 24, paddingHorizontal: 16, paddingBottom: 32 },
  title: { ...typography.title },
  separator: { marginVertical: 16, height: 1, width: '100%' },
  card: { marginBottom: spacing.md },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSubtitle: { fontSize: 12, opacity: 0.6, marginTop: 2, marginBottom: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  error: { color: semanticColors.danger, marginTop: 8 },
  success: { color: semanticColors.success, marginTop: 8 },
  logoutButton: { marginBottom: 32 },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  staffInfo: { flexShrink: 1 },
  staffName: { fontSize: 14, fontWeight: '600' },
  staffMeta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  staffActions: { flexDirection: 'row', gap: 8 },
  staffToggleButton: { paddingHorizontal: 10, paddingVertical: 6 },
  staffInviteHeading: { marginTop: 12, marginBottom: 8 },
  inviteResultCard: { borderRadius: 8, padding: 12, marginBottom: 12 },
  inviteResultTitle: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  inviteResultCode: { fontSize: 20, fontWeight: '700', letterSpacing: 2, marginBottom: 4 },
  inviteResultLink: { fontSize: 12, opacity: 0.7 },
  inviteResultDismiss: { marginTop: 8, alignSelf: 'flex-start' },
  inviteResultDismissText: { color: '#007aff', fontSize: 12, fontWeight: '600' },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
});
