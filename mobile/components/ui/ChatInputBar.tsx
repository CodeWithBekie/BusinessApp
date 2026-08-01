import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { radius, shadows, spacing } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';

// Unified from the two Assistant screens' previously-divergent input rows (a plain text "Send"
// button vs. a circular icon button) into one shared, nicer-looking version.
export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  sending,
  disabled,
  onAttach,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  disabled: boolean;
  onAttach?: () => void;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const tint = Colors[colorScheme].tint;

  return (
    <View style={styles.inputRow} lightColor="#fff" darkColor="#1c1c1e">
      {onAttach && (
        <Pressable style={styles.attachButton} onPress={onAttach} disabled={disabled}>
          <Icon name="paperclip" size={17} color={tint} />
        </Pressable>
      )}
      <TextInput
        style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
        placeholder="Ask a question…"
        placeholderTextColor="#8e8e93"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSend}
        editable={!sending && !disabled}
        returnKeyType="send"
        multiline
      />
      <Pressable
        style={[styles.sendButton, { backgroundColor: tint }, (sending || disabled || !value.trim()) && styles.sendButtonDisabled]}
        disabled={sending || disabled || !value.trim()}
        onPress={onSend}
      >
        {sending ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="arrow.up" size={16} color="#fff" />}
      </Pressable>
    </View>
  );
}

// Shared header row: tinted circular icon + title/subtitle + an always-visible history button and
// a "New chat" button once there's an active conversation worth setting aside.
export function ChatHeader({
  title,
  subtitle,
  hasMessages,
  onNewChat,
  onOpenHistory,
}: {
  title: string;
  subtitle: string;
  hasMessages: boolean;
  onNewChat: () => void;
  onOpenHistory: () => void;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const tint = Colors[colorScheme].tint;

  return (
    <View style={styles.header} lightColor="transparent" darkColor="transparent">
      <View style={[styles.headerAvatar, { backgroundColor: tint }]}>
        <Icon name="sparkles" size={20} color="#fff" />
      </View>
      <View style={styles.headerText} lightColor="transparent" darkColor="transparent">
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.subtitle, isDark ? styles.metaDark : styles.metaLight]}>{subtitle}</Text>
      </View>
      <Pressable style={styles.iconButton} onPress={onOpenHistory}>
        <Icon name="clock.arrow.circlepath" size={18} color={tint} />
      </Pressable>
      {hasMessages && (
        <Pressable style={styles.newChatButton} onPress={onNewChat}>
          <Icon name="square.and.pencil" size={15} color={tint} />
          <Text style={[styles.newChatText, { color: tint }]}>New chat</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 2, marginBottom: spacing.lg },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 1 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  iconButton: { padding: spacing.xs + 2 },
  newChatButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  newChatText: { fontSize: 13, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    borderRadius: 24,
    paddingLeft: spacing.lg + 2,
    paddingRight: spacing.xs + 2,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.md - 4,
    ...shadows.floating,
  },
  attachButton: { paddingBottom: spacing.sm + 2, paddingRight: 2 },
  input: { flex: 1, fontSize: 15, paddingVertical: spacing.sm + 2, maxHeight: 100 },
  inputLight: { color: '#000' },
  inputDark: { color: '#fff' },
  sendButton: { width: 36, height: 36, borderRadius: radius.lg + 2, alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.4 },
});
