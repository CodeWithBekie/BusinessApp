import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { apiClient, AssistantMessage, AssistantPrompt, streamCustomerAssistantChat } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { Icon } from '@/components/ui/Icon';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { semanticColors, shadows } from '@/constants/theme';
import { useIsOnline } from '@/src/offline/networkStatus';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
  streaming?: boolean;
  error?: string;
}

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<AssistantPrompt[]>(FALLBACK_SUGGESTIONS);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    apiClient.getCustomerAssistantPrompts().then(setSuggestions).catch(() => setSuggestions(FALLBACK_SUGGESTIONS));
  }, []);

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

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header} lightColor="transparent" darkColor="transparent">
        <View style={[styles.headerAvatar, { backgroundColor: tint }]}>
          <Icon name="sparkles" size={20} color="#fff" />
        </View>
        <View lightColor="transparent" darkColor="transparent">
          <Text style={styles.title}>Shopping Assistant</Text>
          <Text style={[styles.subtitle, isDark ? styles.metaDark : styles.metaLight]}>Ask about orders, products, or place one</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && (
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

        {messages.map((message, index) => {
          const isUser = message.role === 'user';
          return (
            <View key={index} style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]} lightColor="transparent" darkColor="transparent">
              {!isUser && (
                <View style={[styles.avatarSmall, { backgroundColor: tint }]}>
                  <Icon name="sparkles" size={13} color="#fff" />
                </View>
              )}
              <View
                style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}
                lightColor={isUser ? tint : '#fff'}
                darkColor={isUser ? tint : 'rgba(255,255,255,0.06)'}
              >
                <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
                  {message.content}
                  {message.streaming && message.content.length === 0 ? '…' : ''}
                </Text>
                {message.streaming && message.content.length > 0 && (
                  <ActivityIndicator size="small" color={isUser ? '#fff' : tint} style={styles.inlineSpinner} />
                )}
                {message.toolsUsed && message.toolsUsed.length > 0 && (
                  <View style={styles.toolsUsedRow} lightColor="transparent" darkColor="transparent">
                    <Icon name="checkmark.circle" size={11} color={semanticColors.neutral} />
                    <Text style={[styles.toolsUsed, isDark ? styles.metaDark : styles.metaLight]}>{message.toolsUsed.join(', ')}</Text>
                  </View>
                )}
                {message.error && <Text style={styles.error}>{message.error}</Text>}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {!isOnline && (
        <View style={styles.offlineBanner} lightColor="rgba(192,57,43,0.08)" darkColor="rgba(192,57,43,0.15)">
          <Icon name="wifi.slash" size={13} color={semanticColors.danger} />
          <Text style={styles.offlineText}>You're offline — the Assistant needs a connection.</Text>
        </View>
      )}

      <View style={[styles.inputRow, isDark ? styles.inputRowDark : styles.inputRowLight]} lightColor="#fff" darkColor="#1c1c1e">
        <TextInput
          style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
          placeholder="Ask a question…"
          placeholderTextColor="#8e8e93"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send(input)}
          editable={!sending && isOnline}
          returnKeyType="send"
          multiline
        />
        <Pressable
          style={[styles.sendButton, { backgroundColor: tint }, (sending || !isOnline || !input.trim()) && styles.sendButtonDisabled]}
          disabled={sending || !isOnline || !input.trim()}
          onPress={() => send(input)}
        >
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="arrow.up" size={16} color="#fff" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 20, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 1 },
  messages: { flex: 1 },
  messagesContent: { paddingBottom: 16, flexGrow: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 20, paddingHorizontal: 8 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 19, fontWeight: '700', marginBottom: 6 },
  emptyText: { fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20, maxWidth: 280 },
  suggestionList: { width: '100%', gap: 10 },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  suggestionChipLight: { backgroundColor: '#fff', ...shadows.card },
  suggestionChipDark: { backgroundColor: 'rgba(255,255,255,0.06)' },
  suggestionChipPressed: { opacity: 0.7 },
  suggestionText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14, gap: 8 },
  messageRowUser: { justifyContent: 'flex-end' },
  messageRowAssistant: { justifyContent: 'flex-start' },
  avatarSmall: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  bubble: {
    padding: 13,
    borderRadius: 18,
    maxWidth: '78%',
    ...shadows.card,
  },
  userBubble: { borderBottomRightRadius: 4 },
  assistantBubble: { borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextUser: { color: '#fff' },
  inlineSpinner: { alignSelf: 'flex-start', marginTop: 6 },
  toolsUsedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  toolsUsed: { fontSize: 11 },
  error: { fontSize: 13, color: semanticColors.danger, marginTop: 6, fontWeight: '500' },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  offlineText: { fontSize: 12, color: semanticColors.danger, fontWeight: '500' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderRadius: 24,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
    marginBottom: 12,
    ...shadows.floating,
  },
  inputRowLight: {},
  inputRowDark: {},
  input: { flex: 1, fontSize: 15, paddingVertical: 10, maxHeight: 100 },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
  sendButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.4 },
});
