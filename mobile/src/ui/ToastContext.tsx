import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { View } from 'react-native';

import { Toast, ToastVariant } from '@/components/ui/Toast';

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Wraps the whole app (mobile/app/_layout.tsx) so any screen can call useToast().show(...) after a
// save/action completes — success is the "success animation" (Toast.tsx's scale-in checkmark).
// The extra flex:1 View gives the absolutely-positioned Toast a full-screen positioning context,
// since there's no portal primitive in play here.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, variant: ToastVariant = 'info') => {
    nextId.current += 1;
    const id = nextId.current;
    setToast({ id, message, variant });
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 2500);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      <View style={{ flex: 1 }}>
        {children}
        {toast && <Toast key={toast.id} message={toast.message} variant={toast.variant} />}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
