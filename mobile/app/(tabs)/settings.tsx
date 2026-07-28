import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput } from 'react-native';

import { apiClient, BusinessUserRole, StaffInviteResult, StaffSummary } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
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
      <Pressable style={[styles.button, !isOnline && styles.buttonDisabled]} disabled={status === 'saving' || !isOnline} onPress={submit}>
        <Text style={styles.buttonText}>{status === 'saving' ? 'Connecting…' : 'Connect'}</Text>
      </Pressable>
      {message && <Text style={status === 'error' ? styles.error : styles.success}>{message}</Text>}
      {!isOnline && <Text style={styles.error}>You're offline — connect to save.</Text>}
    </View>
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
      <Pressable style={[styles.button, !isOnline && styles.buttonDisabled]} disabled={status === 'saving' || !isOnline} onPress={submit}>
        <Text style={styles.buttonText}>{status === 'saving' ? 'Connecting…' : 'Connect'}</Text>
      </Pressable>
      {message && <Text style={status === 'error' ? styles.error : styles.success}>{message}</Text>}
      {!isOnline && <Text style={styles.error}>You're offline — connect to save.</Text>}
    </View>
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
      <Pressable style={[styles.button, !isOnline && styles.buttonDisabled]} disabled={status === 'saving' || !isOnline} onPress={submit}>
        <Text style={styles.buttonText}>{status === 'saving' ? 'Uploading…' : 'Upload'}</Text>
      </Pressable>
      {message && <Text style={status === 'error' ? styles.error : styles.success}>{message}</Text>}
      {!isOnline && <Text style={styles.error}>You're offline — connect to upload.</Text>}
    </View>
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
    <View style={styles.card} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
      <Text style={styles.cardTitle}>Customer marketplace</Text>
      <Text style={styles.cardSubtitle}>List your business so customers can browse and order from you in the app.</Text>
      <View style={styles.toggleRow} lightColor="transparent" darkColor="transparent">
        <Text style={styles.toggleLabel}>{isPubliclyListed ? 'Listed' : 'Not listed'}</Text>
        <Switch value={isPubliclyListed} onValueChange={toggle} disabled={saving || !isOnline} />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {!isOnline && <Text style={styles.error}>You're offline — connect to change this.</Text>}
    </View>
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
      <View style={styles.card} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
        <Text style={styles.cardTitle}>Business details</Text>
        <Text style={styles.cardSubtitle}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.card} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
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
      <Pressable style={[styles.button, !isOnline && styles.buttonDisabled]} disabled={status === 'saving' || !isOnline} onPress={submit}>
        <Text style={styles.buttonText}>{status === 'saving' ? 'Saving…' : 'Save'}</Text>
      </Pressable>
      {message && <Text style={status === 'error' ? styles.error : styles.success}>{message}</Text>}
      {!isOnline && <Text style={styles.error}>You're offline — connect to save.</Text>}
    </View>
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
    <View style={styles.card} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
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
                <Pressable
                  style={[styles.staffToggleButton, (updatingId === member.id || !isOnline) && styles.buttonDisabled]}
                  disabled={updatingId === member.id || !isOnline}
                  onPress={() => resendInvite(member)}
                >
                  <Text style={styles.staffToggleButtonText}>Resend invite</Text>
                </Pressable>
              )}
              {(member.status === 'Active' || member.status === 'Deactivated') && (
                <Pressable
                  style={[styles.staffToggleButton, (updatingId === member.id || !isOnline) && styles.buttonDisabled]}
                  disabled={updatingId === member.id || !isOnline}
                  onPress={() => toggleActive(member)}
                >
                  <Text style={styles.staffToggleButtonText}>{member.isActive ? 'Deactivate' : 'Reactivate'}</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      ))}

      <Text style={[styles.cardSubtitle, styles.staffInviteHeading]}>Invite staff</Text>
      <TextInput style={inputStyle} placeholder="Name" value={name} onChangeText={setName} />
      <TextInput style={inputStyle} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <View style={styles.roleRow} lightColor="transparent" darkColor="transparent">
        {INVITABLE_ROLES.map((option) => {
          const active = option.value === role;
          return (
            <Pressable key={option.value} onPress={() => setRole(option.value)} style={[styles.roleChip, active && styles.roleChipActive]}>
              <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable style={[styles.button, (inviting || !isOnline) && styles.buttonDisabled]} disabled={inviting || !isOnline} onPress={invite}>
        <Text style={styles.buttonText}>{inviting ? 'Inviting…' : 'Invite staff member'}</Text>
      </Pressable>
      {inviteError && <Text style={styles.error}>{inviteError}</Text>}
      {!isOnline && <Text style={styles.error}>You're offline — connect to manage staff.</Text>}
    </View>
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
          <DocumentUploadForm />
        </>
      )}
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
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  button: { backgroundColor: '#007aff', paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#c0392b', marginTop: 8 },
  success: { color: '#2e7d32', marginTop: 8 },
  logoutButton: { borderWidth: 1, borderColor: '#c0392b', paddingVertical: 10, borderRadius: 6, alignItems: 'center', marginBottom: 32 },
  logoutButtonText: { color: '#c0392b', fontWeight: '600' },
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
  staffToggleButton: { borderWidth: 1, borderColor: '#c0392b', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  staffToggleButtonText: { color: '#c0392b', fontSize: 12, fontWeight: '600' },
  staffInviteHeading: { marginTop: 12, marginBottom: 8 },
  inviteResultCard: { borderRadius: 8, padding: 12, marginBottom: 12 },
  inviteResultTitle: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  inviteResultCode: { fontSize: 20, fontWeight: '700', letterSpacing: 2, marginBottom: 4 },
  inviteResultLink: { fontSize: 12, opacity: 0.7 },
  inviteResultDismiss: { marginTop: 8, alignSelf: 'flex-start' },
  inviteResultDismissText: { color: '#007aff', fontSize: 12, fontWeight: '600' },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  roleChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: '#ccc' },
  roleChipActive: { backgroundColor: '#007aff', borderColor: '#007aff' },
  roleChipText: { fontSize: 12, fontWeight: '600', opacity: 0.7 },
  roleChipTextActive: { color: '#fff', opacity: 1 },
});
