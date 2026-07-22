import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { apiClient, setAuthToken, setUnauthorizedHandler } from '@/src/api/client';

interface Session {
  token: string;
  businessId: string;
  businessUserId: string;
  role: string;
}

interface AuthContextValue {
  session: Session | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (businessName: string, industryType: string, ownerName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// In-memory only — no expo-secure-store/AsyncStorage persistence (known Phase 0 gap, consistent
// with other simplifications already in this codebase). The session is lost on every app
// reload/restart; the user just logs in again.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  const applySession = useCallback((auth: { token: string; businessId: string; businessUserId: string; role: string }) => {
    setAuthToken(auth.token);
    setSession({ token: auth.token, businessId: auth.businessId, businessUserId: auth.businessUserId, role: auth.role });
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const auth = await apiClient.login(email, password);
      applySession(auth);
    },
    [applySession]
  );

  const signup = useCallback(
    async (businessName: string, industryType: string, ownerName: string, email: string, password: string) => {
      const auth = await apiClient.signup(businessName, industryType, ownerName, email, password);
      applySession(auth);
    },
    [applySession]
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setSession(null);
  }, []);

  // Any 401 from the api client (expired/invalid token) drops back to the login screen instead
  // of screens silently failing forever.
  useMemo(() => setUnauthorizedHandler(() => logout()), [logout]);

  const value = useMemo(() => ({ session, login, signup, logout }), [session, login, signup, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
}
