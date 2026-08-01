import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';

import { apiClient, AssistantMessage, AssistantPrompt, streamCustomerAssistantChat } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { Icon } from '@/components/ui/Icon';
import { ChatBubble, ChatBubbleMessage } from '@/components/ui/ChatBubble';
import { ChatHeader, ChatInputBar } from '@/components/ui/ChatInputBar';
import { ChatHistoryDrawer } from '@/components/ui/ChatHistoryDrawer';
import { ChatSuggestionChips } from '@/components/ui/ChatSuggestionChips';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { semanticColors, shadows } from '@/constants/theme';
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

const HISTORY_KEY = 'assistantConversations:customer';

const FALLBACK_SUGGESTIONS: AssistantPrompt[] = [
  { name: 'what_can_i_order', title: 'What can I order from this business?', message: 'What can I order from this business?' },
  { name: 'wheres_my_order', title: 'Where is my order?', message: 'Where is my order?' },
  { name: 'cancel_last_order', title: 'I want to cancel my last order', message: 'I want to cancel my last order' },
];

export default function CustomerAssistantScreen() {
  const colorScheme = useColorScheme();
  const isOnline = useIsOnline();
  const tint = Colors[colorScheme].tint;
  const isDark = colorScheme === 'dark';
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [conversationId, setConversationId] = useState(() => newConversationId());
  const [conversations, setConversations] = useState<ChatConversation<ChatMessage>[]>([]);
  const [historyDrawerVisible, setHistoryDrawerVisible] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<AssistantPrompt[]>(FALLBACK_SUGGESTIONS);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    apiClient.getCustomerAssistantPrompts().then(setSuggestions).catch(() => setSuggestions(FALLBACK_SUGGESTIONS));
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

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending || !isOnline) return;

      setInput('');
      setSending(true);

      setMessages((prev) => {
        const next: ChatMessage[] = [...prev, { role: 'user', content: trimmed }, { role: 'assistant', content: '', streaming: true }];
        const historyForApi: AssistantMessage[] = next.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));

        streamCustomerAssistantChat(historyForApi, {
          onToken: (token) => {
            setMessages((current) => {
              const updated = [...current];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = { ...last, content: last.content + token };
              return updated;
            });
          },
          onDone: (toolsUsed) => {
            setMessages((current) => {
              const updated = [...current];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = { ...last, streaming: false, toolsUsed };
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
        });

        return next;
      });

      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    },
    [sending, isOnline]
  );

  const lastMessage = messages[messages.length - 1];
  const showFollowUps = !sending && lastMessage?.role === 'assistant' && !lastMessage.streaming && !lastMessage.error;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ChatHeader
        title="Shopping Assistant"
        subtitle="Ask about orders, products, or place one"
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
            <Text style={styles.emptyTitle}>Hi, how can I help?</Text>
            <Text style={[styles.emptyText, isDark ? styles.metaDark : styles.metaLight]}>
              I can browse a business's catalog, place an order, check on your orders, or cancel one.
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

      {!isOnline && (
        <View style={styles.offlineBanner} lightColor="rgba(192,57,43,0.08)" darkColor="rgba(192,57,43,0.15)">
          <Icon name="wifi.slash" size={13} color={semanticColors.danger} />
          <Text style={styles.offlineText}>You're offline — the Assistant needs a connection.</Text>
        </View>
      )}

      <ChatInputBar value={input} onChangeText={setInput} onSend={() => send(input)} sending={sending} disabled={!isOnline} />

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
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 19, fontWeight: '700', marginBottom: 6 },
  emptyText: { fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20, maxWidth: 280 },
  suggestionList: { width: '100%', gap: 10 },
  suggestionChip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13 },
  suggestionChipLight: { backgroundColor: '#fff', ...shadows.card },
  suggestionChipDark: { backgroundColor: 'rgba(255,255,255,0.06)' },
  suggestionChipPressed: { opacity: 0.7 },
  suggestionText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  offlineText: { fontSize: 12, color: semanticColors.danger, fontWeight: '500' },
});
