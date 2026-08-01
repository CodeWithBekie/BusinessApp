import { Modal, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { radius, semanticColors, shadows, spacing } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';
import { ChatConversation } from '@/src/assistant/history';
import { formatRelativeDate } from '@/src/common/format';

// Same overlay/rounded-card bottom-sheet pattern already used by ContextMenu.tsx's action sheet and
// the Assistant's own "Attach context" modal — a browsable list of past conversations, since
// "New chat" now archives rather than erases (see history.ts's remarks).
export function ChatHistoryDrawer<T>({
  visible,
  onClose,
  conversations,
  activeId,
  onSelect,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  conversations: ChatConversation<T>[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const tint = Colors[colorScheme].tint;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.card, { backgroundColor: isDark ? '#1c1c1e' : '#fff' }]}>
            <Text style={styles.title}>Chat history</Text>
            {conversations.length === 0 && (
              <Text style={[styles.empty, isDark ? styles.metaDark : styles.metaLight]}>No past conversations yet.</Text>
            )}
            <ScrollView style={styles.list}>
              {conversations.map((conversation) => {
                const active = conversation.id === activeId;
                return (
                  <View key={conversation.id} style={styles.rowWrap} lightColor="transparent" darkColor="transparent">
                    <Pressable
                      style={[styles.row, active && { borderColor: tint, backgroundColor: 'rgba(0,122,255,0.08)' }]}
                      onPress={() => onSelect(conversation.id)}
                    >
                      <View style={styles.rowText} lightColor="transparent" darkColor="transparent">
                        <Text style={[styles.rowTitle, active && { color: tint }]} numberOfLines={1}>
                          {conversation.title}
                        </Text>
                        <Text style={[styles.rowMeta, isDark ? styles.metaDark : styles.metaLight]}>
                          {formatRelativeDate(conversation.updatedAt)} · {conversation.messages.length} message{conversation.messages.length === 1 ? '' : 's'}
                        </Text>
                      </View>
                      <Pressable hitSlop={8} onPress={() => onDelete(conversation.id)}>
                        <Icon name="trash" size={16} color={semanticColors.danger} />
                      </Pressable>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { width: '100%', maxWidth: 460, maxHeight: '85%' },
  card: { borderRadius: radius.lg, padding: spacing.lg, maxHeight: '100%', ...shadows.floating },
  title: { fontSize: 17, fontWeight: '700', marginBottom: spacing.md },
  empty: { fontSize: 14, paddingVertical: spacing.lg, textAlign: 'center' },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  list: { maxHeight: 520 },
  rowWrap: { marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: radius.md,
    padding: spacing.md - 2,
  },
  rowText: { flex: 1, marginRight: spacing.sm },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowMeta: { fontSize: 12, marginTop: 2 },
  closeButton: { borderWidth: 1, borderColor: '#ccc', borderRadius: radius.sm + 2, paddingVertical: spacing.md - 2, alignItems: 'center', marginTop: spacing.sm },
  closeText: { fontWeight: '600' },
});
