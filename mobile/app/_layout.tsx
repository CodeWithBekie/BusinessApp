import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import AuthScreen from '@/src/auth/AuthScreen';
import { AuthProvider, useAuth } from '@/src/auth/AuthContext';
import { loadSession, type Session } from '@/src/auth/sessionStorage';
import { setAuthToken } from '@/src/api/client';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [sessionRestoreAttempted, setSessionRestoreAttempted] = useState(false);
  const [initialSession, setInitialSession] = useState<Session | null>(null);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    loadSession().then((session) => {
      if (session) {
        setAuthToken(session.token);
      }
      setInitialSession(session);
      setSessionRestoreAttempted(true);
    });
  }, []);

  // Wait on both fonts and the session-restore check before hiding the native splash screen —
  // otherwise a valid persisted session could still be loading while a bare login screen flashes.
  useEffect(() => {
    if (loaded && sessionRestoreAttempted) {
      SplashScreen.hideAsync();
    }
  }, [loaded, sessionRestoreAttempted]);

  if (!loaded || !sessionRestoreAttempted) {
    return null;
  }

  return (
    <AuthProvider initialSession={initialSession}>
      <RootLayoutNav />
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session } = useAuth();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {!session ? (
        <AuthScreen />
      ) : session.kind === 'business' ? (
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
          <Stack.Screen name="catalog-item/[id]" options={{ title: 'Catalog item', presentation: 'modal' }} />
          <Stack.Screen name="pos" options={{ title: 'New sale', presentation: 'modal' }} />
          <Stack.Screen name="supplier/[id]" options={{ title: 'Supplier', presentation: 'modal' }} />
          <Stack.Screen name="purchase-order-new" options={{ title: 'New purchase order', presentation: 'modal' }} />
          <Stack.Screen name="purchase-order/[id]" options={{ title: 'Purchase order' }} />
        </Stack>
      ) : (
        <Stack>
          <Stack.Screen name="(customer)" options={{ headerShown: false }} />
          <Stack.Screen name="business/[id]" options={{ title: 'Storefront' }} />
          <Stack.Screen name="checkout" options={{ title: 'Checkout', presentation: 'modal' }} />
        </Stack>
      )}
    </ThemeProvider>
  );
}
