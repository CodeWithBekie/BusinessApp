import { useState } from 'react';
import { Modal, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import { useColorScheme } from '@/components/useColorScheme';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export type PendingRequest =
  | ({ kind: 'confirm' } & ConfirmOptions & { resolve: (value: boolean) => void })
  | ({ kind: 'prompt' } & PromptOptions & { resolve: (value: string | null) => void });

// One shared Modal shell for both confirm() and prompt() requests from useConfirm() — extracted
// from the near-identical local confirm modals customer-order/[id].tsx and order/[id].tsx each
// had (modalOverlay/modalCard/modalTitle/modalBody/modalActions), plus a TextInput slot for the
// prompt case (e.g. naming a saved purchase-order filter).
export function ConfirmDialog({ request, onClose }: { request: PendingRequest | null; onClose: (value: boolean | string | null) => void }) {
  const colorScheme = useColorScheme();
  const [text, setText] = useState('');

  // Reset the draft text whenever a new prompt request opens.
  const requestKey = request ? `${request.kind}:${request.title}` : null;
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (requestKey !== lastKey) {
    setLastKey(requestKey);
    if (request?.kind === 'prompt') setText('');
  }

  return (
    <Modal visible={!!request} transparent animationType="fade" onRequestClose={() => onClose(request?.kind === 'prompt' ? null : false)}>
      <View style={styles.overlay} lightColor="rgba(0,0,0,0.4)" darkColor="rgba(0,0,0,0.6)">
        {request && (
          <View style={styles.card} lightColor="#fff" darkColor="#1c1c1e">
            <Text style={styles.title}>{request.title}</Text>
            {request.message && (
              <Text style={[styles.body, colorScheme === 'dark' ? styles.bodyDark : styles.bodyLight]}>{request.message}</Text>
            )}
            {request.kind === 'prompt' && (
              <TextInput
                style={[styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight]}
                placeholder={request.placeholder}
                placeholderTextColor="#8e8e93"
                value={text}
                onChangeText={setText}
                autoFocus
              />
            )}
            <View style={styles.actions} lightColor="transparent" darkColor="transparent">
              <Button
                label={request.cancelLabel ?? 'Cancel'}
                variant="secondary"
                style={styles.actionButton}
                onPress={() => onClose(request.kind === 'prompt' ? null : false)}
              />
              <Button
                label={request.confirmLabel ?? (request.kind === 'confirm' ? 'Confirm' : 'Save')}
                variant={request.kind === 'confirm' && request.destructive ? 'destructive' : 'primary'}
                style={styles.actionButton}
                disabled={request.kind === 'prompt' && !text.trim()}
                onPress={() => onClose(request.kind === 'prompt' ? text.trim() : true)}
              />
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, borderRadius: 16, padding: 22 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  body: { fontSize: 14, marginBottom: 20, lineHeight: 20 },
  bodyLight: { color: '#666' },
  bodyDark: { color: '#aaa' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 20 },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
  actions: { flexDirection: 'row', gap: 12 },
  actionButton: { flex: 1 },
});
