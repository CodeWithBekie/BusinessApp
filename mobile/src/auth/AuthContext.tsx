import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { apiClient, setAuthToken, setUnauthorizedHandler } from '@/src/api/client';
import { clearAllCache } from '@/src/offline/cache';
import { clearSession, saveSession, type Session } from '@/src/auth/sessionStorage';

export type { Session };

interface AuthContextValue {
  session: Session | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (businessName: string, industryType: string, ownerName: string, email: string, password: string) => Promise<void>;
  acceptInvite: (token: string, password: string) => Promise<void>;
  customerLogin: (email: string, password: string) => Promise<void>;
  customerSignup: (email: string, password: string, name?: string, phoneNumber?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Session is persisted to expo-secure-store (see sessionStorage.ts) and restored on app launch
// by RootLayout, which passes it in as `initialSession`. Only one session (business OR customer)
// is ever active at a time — the `kind` discriminant is how every consumer branches.
export function AuthProvider({ children, initialSession = null }: { children: ReactNode; initialSession?: Session | null }) {
  const [session, setSession] = useState<Session | null>(initialSession);

  const applySession = useCallback((nextSession: Session) => {
    setAuthToken(nextSession.token);
    setSession(nextSession);
    void saveSession(nextSession);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const auth = await apiClient.login(email, password);
      applySession({ kind: 'business', token: auth.token, businessId: auth.businessId, businessUserId: auth.businessUserId, role: auth.role });
    },
    [applySession]
  );

  const signup = useCallback(
    async (businessName: string, industryType: string, ownerName: string, email: string, password: string) => {
      const auth = await apiClient.signup(businessName, industryType, ownerName, email, password);
      applySession({ kind: 'business', token: auth.token, businessId: auth.businessId, businessUserId: auth.businessUserId, role: auth.role });
    },
    [applySession]
  );

  const acceptInvite = useCallback(
    async (token: string, password: string) => {
      const auth = await apiClient.acceptStaffInvite(token, password);
      applySession({ kind: 'business', token: auth.token, businessId: auth.businessId, businessUserId: auth.businessUserId, role: auth.role });
    },
    [applySession]
  );

  const customerLogin = useCallback(
    async (email: string, password: string) => {
      const auth = await apiClient.customerLogin(email, password);
      applySession({ kind: 'customer', token: auth.token, customerAccountId: auth.customerAccountId, email: auth.email, name: auth.name });
    },
    [applySession]
  );

  const customerSignup = useCallback(
    async (email: string, password: string, name?: string, phoneNumber?: string) => {
      const auth = await apiClient.customerSignup(email, password, name, phoneNumber);
      applySession({ kind: 'customer', token: auth.token, customerAccountId: auth.customerAccountId, email: auth.email, name: auth.name });
    },
    [applySession]
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setSession(null);
    void clearSession();
    void clearAllCache();
  }, []);

  // Any 401 from the api client (expired/invalid token) drops back to the login screen instead
  // of screens silently failing forever.
  useMemo(() => setUnauthorizedHandler(() => logout()), [logout]);

  const value = useMemo(
    () => ({ session, login, signup, acceptInvite, customerLogin, customerSignup, logout }),
    [session, login, signup, acceptInvite, customerLogin, customerSignup, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
}
