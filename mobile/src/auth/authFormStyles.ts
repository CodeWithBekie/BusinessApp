import { StyleSheet } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';

// Shared by AuthScreen.tsx and CustomerAuthScreen.tsx (same visual shape, different identity) —
// pulled out of AuthScreen.tsx to avoid a require cycle between the two (Metro warned: "Require
// cycles are allowed, but can result in uninitialized values" — CustomerAuthScreen only ever
// needed these two exports, not the rest of AuthScreen).
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
