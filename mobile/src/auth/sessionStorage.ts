import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface BusinessSession {
  kind: 'business';
  token: string;
  businessId: string;
  businessUserId: string;
  role: string;
}

export interface CustomerSession {
  kind: 'customer';
  token: string;
  customerAccountId: string;
  email: string;
  name: string | null;
}

export type Session = BusinessSession | CustomerSession;

const SESSION_KEY = 'session';

// expo-secure-store has no real web implementation (an empty native-module stub) — same
// limitation as @react-native-community/datetimepicker elsewhere in this app. localStorage is
// the pragmatic web fallback; native iOS/Android builds still get the encrypted keychain/keystore.
async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function saveSession(session: Session): Promise<void> {
  await setItem(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<Session | null> {
  const raw = await getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await deleteItem(SESSION_KEY);
}
