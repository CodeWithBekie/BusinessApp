import { Redirect } from 'expo-router';

import { useAuth } from '@/src/auth/AuthContext';

// `(tabs)` and `(customer)` are route GROUPS — invisible in the URL — so their own index screens
// both implicitly claim the exact same bare "/" path. Without a single unambiguous owner of "/",
// expo-router's route resolution for that path picks one of the two group indexes and keeps
// showing it regardless of which Stack app/_layout.tsx actually mounts for the current session
// (confirmed: deep-linking straight to an unambiguous path like /settings works correctly, only
// bare "/" was affected). This file is that single owner — it immediately hands off to whichever
// group matches the active session.
export default function RootIndex() {
  const { session } = useAuth();

  if (session?.kind === 'business') {
    return <Redirect href="/(tabs)" />;
  }
  if (session?.kind === 'customer') {
    return <Redirect href="/(customer)" />;
  }
  return null;
}
