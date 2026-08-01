import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { ChatBubble, ChatBubbleMessage } from '@/components/ui/ChatBubble';
import { ChatHeader, ChatInputBar } from '@/components/ui/ChatInputBar';
import { ChatHistoryDrawer } from '@/components/ui/ChatHistoryDrawer';
import { ChatSuggestionChips } from '@/components/ui/ChatSuggestionChips';
import { apiClient, AssistantPrompt, AssistantResourceSummary, ElicitationSchema, streamAssistantChat } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { radius, semanticColors, shadows, spacing } from '@/constants/theme';
import {
  ChatConversation,
  deleteConversation,
  deriveConversationTitle,
  getConversation,
  listConversations,
  newConversationId,
  saveConversation,
} from '@/src/assistant/history';
import { useIsOnline } from '@/src/offline/networkStatus';

type ChatMessage = ChatBubbleMessage;

interface PendingElicitation {
  elicitationId: string;
  message: string;
  schema: ElicitationSchema;
}

const HISTORY_KEY = 'assistantConversations:owner';

const FALLBACK_SUGGESTIONS: AssistantPrompt[] = [
  { name: 'sales_this_week', title: 'How are sales this week?', message: 'How are sales this week? Give me a quick summary.' },
  { name: 'top_selling_items', title: 'What were our top-selling items this month?', message: 'What were our top-selling items this month?' },
  { name: 'sales_today', title: 'Any sales today?', message: 'Any sales today? Give me the total and a quick breakdown.' },
];

export default function AssistantScreen() {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const isDark = colorScheme === 'dark';
  const isOnline = useIsOnline();
  const { attachUri, attachLabel } = useLocalSearchParams<{ attachUri?: string; attachLabel?: string }>();
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [conversationId, setConversationId] = useState(() => newConversationId());
  const [conversations, setConversations] = useState<ChatConversation<ChatMessage>[]>([]);
  const [historyDrawerVisible, setHistoryDrawerVisible] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [attachedResources, setAttachedResources] = useState<AssistantResourceSummary[]>([]);
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [availableResources, setAvailableResources] = useState<AssistantResourceSummary[] | null>(null);
  const [attachSearch, setAttachSearch] = useState('');
  const [searchResults, setSearchResults] = useState<AssistantResourceSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pendingElicitation, setPendingElicitation] = useState<PendingElicitation | null>(null);
  const [elicitationValues, setElicitationValues] = useState<Record<string, string>>({});
  const [submittingElicitation, setSubmittingElicitation] = useState(false);
  const [suggestions, setSuggestions] = useState<AssistantPrompt[]>(FALLBACK_SUGGESTIONS);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    apiClient.getAssistantPrompts().then(setSuggestions).catch(() => setSuggestions(FALLBACK_SUGGESTIONS));
  }, []);

  useEffect(() => {
    listConversations<ChatMessage>(HISTORY_KEY)
      .then((all) => {
        if (all.length > 0) {
          setConversationId(all[0].id);
          setMessages(all[0].messages);
        }
      })
      .finally(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    const cleanMessages = messages.filter((m) => !m.streaming);
    if (cleanMessages.length === 0) return;
    const firstUser = cleanMessages.find((m) => m.role === 'user');
    saveConversation(HISTORY_KEY, {
      id: conversationId,
      title: firstUser ? deriveConversationTitle(firstUser.content) : 'New conversation',
      messages: cleanMessages,
      updatedAt: new Date().toISOString(),
    });
  }, [messages, historyLoaded, conversationId]);

  const startNewChat = useCallback(() => {
    setConversationId(newConversationId());
    setMessages([]);
  }, []);

  const openHistory = useCallback(() => {
    listConversations<ChatMessage>(HISTORY_KEY).then(setConversations);
    setHistoryDrawerVisible(true);
  }, []);

  const selectConversation = useCallback(async (id: string) => {
    const conversation = await getConversation<ChatMessage>(HISTORY_KEY, id);
    if (conversation) {
      setConversationId(conversation.id);
      setMessages(conversation.messages);
    }
    setHistoryDrawerVisible(false);
  }, []);

  const removeConversation = useCallback(
    async (id: string) => {
      await deleteConversation(HISTORY_KEY, id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === conversationId) {
        setConversationId(newConversationId());
        setMessages([]);
      }
    },
    [conversationId]
  );

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

  // Live autocomplete against the MCP server's "completions" capability — lets the owner find an
  // order/purchase-order to attach by typing a partial id, instead of scrolling a long static list.
  useEffect(() => {
    const query = attachSearch.trim();
    if (!query) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(() => {
      Promise.all([
        apiClient.getAssistantCompletions('business://orders/{orderId}', 'orderId', query),
        apiClient.getAssistantCompletions('business://purchase-orders/{purchaseOrderId}', 'purchaseOrderId', query),
      ])
        .then(([orders, purchaseOrders]) => {
          setSearchResults([
            ...orders.values.map((id) => ({ uri: `business://orders/${id}`, name: null, title: `Order ${id.slice(0, 4)}` })),
            ...purchaseOrders.values.map((id) => ({ uri: `business://purchase-orders/${id}`, name: null, title: `Purchase Order ${id.slice(0, 4)}` })),
          ]);
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [attachSearch]);

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

  const lastMessage = messages[messages.length - 1];
  const showFollowUps = !sending && lastMessage?.role === 'assistant' && !lastMessage.streaming && !lastMessage.error;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ChatHeader
        title="AI Business Brain"
        subtitle="Ask about sales, stock, suppliers, or your documents"
        hasMessages={messages.length > 0}
        onNewChat={startNewChat}
        onOpenHistory={openHistory}
      />

      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {historyLoaded && messages.length === 0 && (
          <View style={styles.emptyState} lightColor="transparent" darkColor="transparent">
            <View style={[styles.emptyIcon, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f2f2f7' }]}>
              <Icon name="bubble.left.and.bubble.right" size={30} color={tint} />
            </View>
            <Text style={styles.emptyTitle}>Ask me anything about your business</Text>
            <Text style={[styles.emptyText, isDark ? styles.metaDark : styles.metaLight]}>
              Sales performance, stock levels, supplier history, or anything from your uploaded business documents.
            </Text>
            <View style={styles.suggestionList} lightColor="transparent" darkColor="transparent">
              {suggestions.map((suggestion) => (
                <Pressable
                  key={suggestion.name}
                  style={({ pressed }) => [styles.suggestionChip, isDark ? styles.suggestionChipDark : styles.suggestionChipLight, pressed && styles.suggestionChipPressed]}
                  onPress={() => send(suggestion.message)}
                >
                  <Icon name="sparkles" size={15} color={tint} />
                  <Text style={[styles.suggestionText, { color: tint }]}>{suggestion.title}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {messages.map((message, index) => (
          <ChatBubble key={index} message={message} />
        ))}

        {showFollowUps && <ChatSuggestionChips toolsUsed={lastMessage.toolsUsed} onSelect={send} />}
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

      {!isOnline && (
        <View style={styles.offlineBanner} lightColor="rgba(192,57,43,0.08)" darkColor="rgba(192,57,43,0.15)">
          <Icon name="wifi.slash" size={13} color={semanticColors.danger} />
          <Text style={styles.offlineText}>You're offline — the Assistant needs a connection.</Text>
        </View>
      )}

      <ChatInputBar value={input} onChangeText={setInput} onSend={() => send(input)} sending={sending} disabled={!isOnline} onAttach={openAttachSheet} />

      <Modal visible={attachSheetVisible} transparent animationType="fade" onRequestClose={() => setAttachSheetVisible(false)}>
        <View style={styles.modalOverlay} lightColor="rgba(0,0,0,0.4)" darkColor="rgba(0,0,0,0.6)">
          <View style={styles.modalCard} lightColor="#fff" darkColor="#1c1c1e">
            <Text style={styles.modalTitle}>Attach context</Text>
            <TextInput
              style={[styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight, styles.searchInput]}
              placeholder="Find an order or purchase order by id…"
              value={attachSearch}
              onChangeText={setAttachSearch}
            />
            {searching && <ActivityIndicator style={styles.loading} />}
            {!searching &&
              attachSearch.trim().length > 0 &&
              (searchResults ?? []).map((resource) => {
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
            {!searching && attachSearch.trim().length > 0 && (searchResults ?? []).length === 0 && (
              <Text style={[styles.modalBody, colorScheme === 'dark' ? styles.metaDark : styles.metaLight]}>No matching order or purchase order.</Text>
            )}

            {attachSearch.trim().length === 0 && (
              <>
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
              </>
            )}
            <Pressable
              style={styles.modalCancelButtonWide}
              onPress={() => {
                setAttachSheetVisible(false);
                setAttachSearch('');
              }}
            >
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

      <ChatHistoryDrawer
        visible={historyDrawerVisible}
        onClose={() => setHistoryDrawerVisible(false)}
        conversations={conversations}
        activeId={conversationId}
        onSelect={selectConversation}
        onDelete={removeConversation}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 20, paddingHorizontal: 16 },
  messages: { flex: 1 },
  messagesContent: { paddingBottom: 16, flexGrow: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 20, paddingHorizontal: 8 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  emptyTitle: { fontSize: 19, fontWeight: '700', marginBottom: spacing.xs + 2, textAlign: 'center' },
  emptyText: { fontSize: 14, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 20, maxWidth: 300 },
  suggestionList: { width: '100%', gap: spacing.sm + 2 },
  suggestionChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, borderRadius: radius.md + 2, paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 1 },
  suggestionChipLight: { backgroundColor: '#fff', ...shadows.card },
  suggestionChipDark: { backgroundColor: 'rgba(255,255,255,0.06)' },
  suggestionChipPressed: { opacity: 0.7 },
  suggestionText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  attachmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2, paddingBottom: spacing.xs + 2 },
  attachmentChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 14, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  attachmentChipText: { fontSize: 11, fontWeight: '600' },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, borderRadius: radius.sm + 2, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  offlineText: { fontSize: 12, color: semanticColors.danger, fontWeight: '500' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2 },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
  sendButton: { paddingHorizontal: spacing.lg + 2, paddingVertical: spacing.sm + 2, borderRadius: radius.lg },
  sendButtonText: { color: '#fff', fontWeight: '600' },
  loading: { marginVertical: 16 },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 12, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  searchInput: { marginBottom: 12 },
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
