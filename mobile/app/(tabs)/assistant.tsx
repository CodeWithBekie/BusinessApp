import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { streamAssistantChat } from '@/src/api/client';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  streaming?: boolean;
  error?: string;
}

const SUGGESTIONS = ['How are sales this week?', 'What were our top-selling items this month?', 'Any sales today?'];

export default function AssistantScreen() {
  const colorScheme = useColorScheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      setInput('');
      setSending(true);

      setMessages((prev) => {
        const next: ChatMessage[] = [...prev, { role: 'user', content: trimmed }, { role: 'assistant', content: '', streaming: true }];
        // Fire the request against the history as of this update (excludes the streaming placeholder).
        const historyForApi = next.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));

        streamAssistantChat(historyForApi, {
          onToken: (token) => {
            setMessages((current) => {
              const updated = [...current];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = { ...last, content: last.content + token };
              return updated;
            });
          },
          onDone: (citations) => {
            setMessages((current) => {
              const updated = [...current];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = { ...last, streaming: false, citations };
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
    [sending]
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
            {SUGGESTIONS.map((suggestion) => (
              <Pressable key={suggestion} style={styles.suggestionChip} onPress={() => send(suggestion)}>
                <Text style={styles.suggestionText}>{suggestion}</Text>
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
            {message.error && <Text style={styles.error}>{message.error}</Text>}
          </View>
        ))}
      </ScrollView>

      <View style={styles.inputRow} lightColor="transparent" darkColor="transparent">
        <TextInput
          style={[styles.input, colorScheme === 'dark' ? styles.inputDark : styles.inputLight]}
          placeholder="Ask a question…"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send(input)}
          editable={!sending}
          returnKeyType="send"
        />
        <Pressable style={[styles.sendButton, sending && styles.sendButtonDisabled]} disabled={sending} onPress={() => send(input)}>
          <Text style={styles.sendButtonText}>{sending ? '…' : 'Send'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24, paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: 'bold' },
  separator: { marginVertical: 16, height: 1, width: '100%' },
  messages: { flex: 1 },
  messagesContent: { paddingBottom: 16 },
  emptyState: { paddingVertical: 12 },
  emptyText: { fontSize: 14, marginBottom: 12 },
  suggestionChip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  suggestionText: { fontSize: 13, color: '#007aff', fontWeight: '500' },
  bubble: { padding: 12, borderRadius: 10, marginBottom: 10, maxWidth: '88%', borderWidth: 1, borderColor: '#ccc' },
  userBubble: { alignSelf: 'flex-end' },
  assistantBubble: { alignSelf: 'flex-start' },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  inlineSpinner: { alignSelf: 'flex-start', marginTop: 6 },
  citations: { fontSize: 11, marginTop: 8, fontStyle: 'italic' },
  error: { fontSize: 12, color: '#c0392b', marginTop: 6 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  inputRow: { flexDirection: 'row', gap: 8, paddingVertical: 12, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
  sendButton: { backgroundColor: '#007aff', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  sendButtonDisabled: { opacity: 0.6 },
  sendButtonText: { color: '#fff', fontWeight: '600' },
});
