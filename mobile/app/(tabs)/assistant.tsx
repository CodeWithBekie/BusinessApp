import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { apiClient, AssistantPrompt, AssistantResourceSummary, ElicitationSchema, streamAssistantChat } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { radius, semanticColors, shadows, spacing, typography } from '@/constants/theme';
import { useIsOnline } from '@/src/offline/networkStatus';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  toolsUsed?: string[];
  streaming?: boolean;
  error?: string;
}

interface PendingElicitation {
  elicitationId: string;
  message: string;
  schema: ElicitationSchema;
}

const FALLBACK_SUGGESTIONS: AssistantPrompt[] = [
  { name: 'sales_this_week', title: 'How are sales this week?', message: 'How are sales this week? Give me a quick summary.' },
  { name: 'top_selling_items', title: 'What were our top-selling items this month?', message: 'What were our top-selling items this month?' },
  { name: 'sales_today', title: 'Any sales today?', message: 'Any sales today? Give me the total and a quick breakdown.' },
];

export default function AssistantScreen() {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const isOnline = useIsOnline();
  const { attachUri, attachLabel } = useLocalSearchParams<{ attachUri?: string; attachLabel?: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [attachedResources, setAttachedResources] = useState<AssistantResourceSummary[]>([]);
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [availableResources, setAvailableResources] = useState<AssistantResourceSummary[] | null>(null);
  const [pendingElicitation, setPendingElicitation] = useState<PendingElicitation | null>(null);
  const [elicitationValues, setElicitationValues] = useState<Record<string, string>>({});
  const [submittingElicitation, setSubmittingElicitation] = useState(false);
  const [suggestions, setSuggestions] = useState<AssistantPrompt[]>(FALLBACK_SUGGESTIONS);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    apiClient.getAssistantPrompts().then(setSuggestions).catch(() => setSuggestions(FALLBACK_SUGGESTIONS));
  }, []);

  // A deep link from Order/Purchase-Order detail ("Ask Assistant about this") presets an attachment.
  useEffect(() => {
    if (!attachUri) return;
    setAttachedResources((prev) => (prev.some((r) => r.uri === attachUri) ? prev : [...prev, { uri: attachUri, name: attachLabel ?? attachUri, title: attachLabel ?? null }]));
  }, [attachUri, attachLabel]);

  const openAttachSheet = useCallback(() => {
    setAttachSheetVisible(true);
    if (availableResources === null) {
      apiClient.getAssistantResources().then(setAvailableResources).catch(() => setAvailableResources([]));
    }
  }, [availableResources]);

  const toggleAttachment = useCallback((resource: AssistantResourceSummary) => {
    setAttachedResources((prev) =>
      prev.some((r) => r.uri === resource.uri) ? prev.filter((r) => r.uri !== resource.uri) : [...prev, resource]
    );
  }, []);

  const removeAttachment = useCallback((uri: string) => {
    setAttachedResources((prev) => prev.filter((r) => r.uri !== uri));
  }, []);

  useEffect(() => {
    if (pendingElicitation) setElicitationValues({});
  }, [pendingElicitation]);

  const submitElicitation = useCallback(
    async (action: 'accept' | 'decline' | 'cancel') => {
      if (!pendingElicitation) return;
      setSubmittingElicitation(true);
      try {
        let content: Record<string, unknown> | undefined;
        if (action === 'accept') {
          content = {};
          for (const [key, prop] of Object.entries(pendingElicitation.schema.properties)) {
            const raw = elicitationValues[key] ?? '';
            if (prop.type === 'number' || prop.type === 'integer') content[key] = Number(raw);
            else if (prop.type === 'boolean') content[key] = raw === 'true';
            else content[key] = raw;
          }
        }
        await apiClient.submitElicitation(pendingElicitation.elicitationId, action, content);
        setPendingElicitation(null);
      } catch (err) {
        setMessages((current) => [...current, { role: 'assistant', content: `Could not submit that: ${(err as Error).message}` }]);
      } finally {
        setSubmittingElicitation(false);
      }
    },
    [pendingElicitation, elicitationValues]
  );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending || !isOnline) return;

      setInput('');
      setSending(true);

      setMessages((prev) => {
        const next: ChatMessage[] = [...prev, { role: 'user', content: trimmed }, { role: 'assistant', content: '', streaming: true }];
        // Fire the request against the history as of this update (excludes the streaming placeholder).
        const historyForApi = next.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));

        streamAssistantChat(
          historyForApi,
          {
            onToken: (token) => {
              setMessages((current) => {
                const updated = [...current];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = { ...last, content: last.content + token };
                return updated;
              });
            },
            onDone: (citations, toolsUsed) => {
              setMessages((current) => {
                const updated = [...current];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = { ...last, streaming: false, citations, toolsUsed };
                return updated;
              });
              setSending(false);
            },
            onError: (message) => {
              setMessages((current) => {
                const updated = [...current];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = { ...last, streaming: false, error: message };
                return updated;
              });
              setSending(false);
            },
            onElicitationRequest: (elicitationId, message, schema) => {
              setPendingElicitation({ elicitationId, message, schema });
            },
          },
          attachedResources.map((r) => r.uri)
        );

        return next;
      });

      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    },
    [sending, isOnline, attachedResources]
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.title}>AI Business Brain</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && (
          <View style={styles.emptyState} lightColor="transparent" darkColor="transparent">
            <Text style={[styles.emptyText, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
              Ask about your sales performance or anything from your uploaded business documents.
            </Text>
            {suggestions.map((suggestion) => (
              <Pressable key={suggestion.name} onPress={() => send(suggestion.message)}>
                {({ pressed }) => (
                  <View style={[styles.suggestionChip, pressed && styles.suggestionChipPressed]} lightColor="#fff" darkColor="rgba(255,255,255,0.05)">
                    <Icon name="sparkles" size={14} color={tint} />
                    <Text style={[styles.suggestionText, { color: tint }]}>{suggestion.title}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        )}

        {messages.map((message, index) => (
          <View
            key={index}
            style={[styles.bubble, message.role === 'user' ? styles.userBubble : styles.assistantBubble]}
            lightColor={message.role === 'user' ? '#e5f1ff' : '#fff'}
            darkColor={message.role === 'user' ? 'rgba(0, 122, 255, 0.25)' : 'rgba(255,255,255,0.05)'}
          >
            <Text style={styles.bubbleText}>
              {message.content}
              {message.streaming && message.content.length === 0 ? '…' : ''}
            </Text>
            {message.streaming && message.content.length > 0 && <ActivityIndicator size="small" style={styles.inlineSpinner} />}
            {message.citations && message.citations.length > 0 && (
              <Text style={[styles.citations, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
                Sources: {message.citations.join(', ')}
              </Text>
            )}
            {message.toolsUsed && message.toolsUsed.length > 0 && (
              <Text style={[styles.toolsUsed, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>
                Used: {message.toolsUsed.join(', ')}
              </Text>
            )}
            {message.error && <Text style={styles.error}>{message.error}</Text>}
          </View>
        ))}
      </ScrollView>

      {attachedResources.length > 0 && (
        <View style={styles.attachmentRow} lightColor="transparent" darkColor="transparent">
          {attachedResources.map((resource) => (
            <Pressable key={resource.uri} style={[styles.attachmentChip, { borderColor: tint }]} onPress={() => removeAttachment(resource.uri)}>
              <Icon name="paperclip" size={11} color={tint} />
              <Text style={[styles.attachmentChipText, { color: tint }]}>
                {resource.title ?? resource.name ?? resource.uri} ✕
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {!isOnline && <Text style={styles.error}>You're offline — the Assistant needs a connection.</Text>}

      <View style={styles.inputRow} lightColor="transparent" darkColor="transparent">
        <Pressable style={[styles.attachButton, !isOnline && styles.sendButtonDisabled]} onPress={openAttachSheet} disabled={!isOnline}>
          <Icon name="paperclip" size={16} color={tint} />
        </Pressable>
        <TextInput
          style={[styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight]}
          placeholder="Ask a question…"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send(input)}
          editable={!sending && isOnline}
          returnKeyType="send"
        />
        <Pressable
          style={[styles.sendButton, { backgroundColor: tint }, (sending || !isOnline) && styles.sendButtonDisabled]}
          disabled={sending || !isOnline}
          onPress={() => send(input)}
        >
          <Text style={styles.sendButtonText}>{sending ? '…' : 'Send'}</Text>
        </Pressable>
      </View>

      <Modal visible={attachSheetVisible} transparent animationType="fade" onRequestClose={() => setAttachSheetVisible(false)}>
        <View style={styles.modalOverlay} lightColor="rgba(0,0,0,0.4)" darkColor="rgba(0,0,0,0.6)">
          <View style={styles.modalCard} lightColor="#fff" darkColor="#1c1c1e">
            <Text style={styles.modalTitle}>Attach context</Text>
            {availableResources === null && <ActivityIndicator style={styles.loading} />}
            {availableResources !== null && availableResources.length === 0 && (
              <Text style={[styles.modalBody, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>Nothing available to attach yet.</Text>
            )}
            {availableResources?.map((resource) => {
              const attached = attachedResources.some((r) => r.uri === resource.uri);
              return (
                <Pressable
                  key={resource.uri}
                  style={[styles.resourceOption, attached && { borderColor: tint, backgroundColor: 'rgba(0,122,255,0.08)' }]}
                  onPress={() => toggleAttachment(resource)}
                >
                  <Text style={[styles.resourceOptionText, attached && { color: tint, fontWeight: '600' }]}>
                    {attached ? '✓ ' : ''}
                    {resource.title ?? resource.name ?? resource.uri}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable style={styles.modalCancelButtonWide} onPress={() => setAttachSheetVisible(false)}>
              <Text style={styles.modalCancelText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={pendingElicitation !== null} transparent animationType="fade" onRequestClose={() => submitElicitation('cancel')}>
        <View style={styles.modalOverlay} lightColor="rgba(0,0,0,0.4)" darkColor="rgba(0,0,0,0.6)">
          <View style={styles.modalCard} lightColor="#fff" darkColor="#1c1c1e">
            <Text style={styles.modalTitle}>The Assistant needs more info</Text>
            {pendingElicitation && (
              <>
                <Text style={[styles.modalBody, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>{pendingElicitation.message}</Text>
                {Object.entries(pendingElicitation.schema.properties ?? {}).map(([key, prop]) => (
                  <View key={key} lightColor="transparent" darkColor="transparent">
                    <Text style={styles.fieldLabel}>{prop.title ?? key}</Text>
                    <TextInput
                      style={[styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight]}
                      placeholder={prop.description ?? ''}
                      value={elicitationValues[key] ?? ''}
                      onChangeText={(text) => setElicitationValues((prev) => ({ ...prev, [key]: text }))}
                      keyboardType={prop.type === 'number' || prop.type === 'integer' ? 'decimal-pad' : 'default'}
                    />
                  </View>
                ))}
                <View style={styles.modalActions} lightColor="transparent" darkColor="transparent">
                  <Pressable
                    style={[styles.modalButton, styles.modalCancelButton]}
                    disabled={submittingElicitation}
                    onPress={() => submitElicitation('decline')}
                  >
                    <Text style={styles.modalCancelText}>Decline</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalButton, styles.sendButton, { backgroundColor: tint }]}
                    disabled={submittingElicitation}
                    onPress={() => submitElicitation('accept')}
                  >
                    <Text style={styles.sendButtonText}>{submittingElicitation ? '…' : 'Submit'}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24, paddingHorizontal: 16 },
  title: { ...typography.title },
  separator: { marginVertical: 16, height: 1, width: '100%' },
  messages: { flex: 1 },
  messagesContent: { paddingBottom: 16 },
  emptyState: { paddingVertical: 12 },
  emptyText: { fontSize: 14, marginBottom: 12 },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
    ...shadows.card,
  },
  suggestionChipPressed: { opacity: 0.7 },
  suggestionText: { fontSize: 13, fontWeight: '500' },
  bubble: { padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm + 2, maxWidth: '88%', ...shadows.card },
  userBubble: { alignSelf: 'flex-end' },
  assistantBubble: { alignSelf: 'flex-start' },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  inlineSpinner: { alignSelf: 'flex-start', marginTop: 6 },
  citations: { fontSize: 11, marginTop: 8, fontStyle: 'italic' },
  toolsUsed: { fontSize: 11, marginTop: 4 },
  error: { fontSize: 12, color: semanticColors.danger, marginTop: 6 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  inputRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2 },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
  sendButton: { paddingHorizontal: spacing.lg + 2, paddingVertical: spacing.sm + 2, borderRadius: radius.lg },
  sendButtonDisabled: { opacity: 0.6 },
  sendButtonText: { color: '#fff', fontWeight: '600' },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2, paddingBottom: spacing.xs + 2 },
  attachmentChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 14, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  attachmentChipText: { fontSize: 11, fontWeight: '600' },
  loading: { marginVertical: 16 },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  modalBody: { fontSize: 14, marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalCancelButton: { borderWidth: 1, borderColor: '#ccc' },
  modalCancelButtonWide: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  modalCancelText: { fontWeight: '600' },
  resourceOption: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 8 },
  resourceOptionText: { fontSize: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '600', opacity: 0.7, marginBottom: 4, marginTop: 8 },
});
