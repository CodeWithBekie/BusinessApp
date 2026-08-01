import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

import { ConfirmDialog, ConfirmOptions, PendingRequest, PromptOptions } from '@/components/ui/ConfirmDialog';

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

// Wraps the whole app (mobile/app/_layout.tsx) so any screen can await useConfirm().confirm(...)
// before a destructive action, or .prompt(...) to capture a short bit of text (e.g. naming a saved
// filter) — one shared Modal (ConfirmDialog.tsx) instead of each screen rolling its own.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingRequest | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ kind: 'confirm', ...options, resolve });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setPending({ kind: 'prompt', ...options, resolve });
    });
  }, []);

  const handleClose = useCallback(
    (value: boolean | string | null) => {
      setPending((current) => {
        if (!current) return null;
        if (current.kind === 'confirm') {
          current.resolve(typeof value === 'boolean' ? value : false);
        } else {
          current.resolve(typeof value === 'string' ? value : null);
        }
        return null;
      });
    },
    []
  );

  return (
    <ConfirmContext.Provider value={{ confirm, prompt }}>
      {children}
      <ConfirmDialog request={pending} onClose={handleClose} />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
