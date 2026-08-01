import * as Clipboard from 'expo-clipboard';
import { ActivityIndicator, Share, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { radius, semanticColors, shadows, spacing } from '@/constants/theme';
import { Icon } from '@/components/ui/Icon';
import { ContextMenu, ContextMenuAction } from '@/components/ui/ContextMenu';

export interface ChatBubbleMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  toolsUsed?: string[];
  streaming?: boolean;
  error?: string;
}

// Small hand-rolled line-based formatter — bold **text**, "-"/"*" bullets, "1." numbered lines —
// instead of pulling in a markdown-rendering dependency for what the Assistant's replies actually
// produce (matches this app's existing "plain View bars, no charting library" preference for
// avoiding heavy deps when a simple parser covers the real need).
function renderInlineBold(line: string, keyPrefix: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter((part) => part.length > 0);
  return parts.map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <Text key={`${keyPrefix}-${index}`} style={styles.bold}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      <Text key={`${keyPrefix}-${index}`}>{part}</Text>
    )
  );
}

function FormattedContent({ content, textStyle }: { content: string; textStyle: object }) {
  const lines = content.split('\n');
  return (
    <>
      {lines.map((line, index) => {
        const bulletMatch = /^\s*[-*]\s+(.*)$/.exec(line);
        const numberedMatch = /^\s*(\d+)\.\s+(.*)$/.exec(line);
        if (bulletMatch) {
          return (
            <View key={index} style={styles.listRow} lightColor="transparent" darkColor="transparent">
              <Text style={textStyle}>{'•  '}</Text>
              <Text style={[textStyle, styles.listText]}>{renderInlineBold(bulletMatch[1], `b${index}`)}</Text>
            </View>
          );
        }
        if (numberedMatch) {
          return (
            <View key={index} style={styles.listRow} lightColor="transparent" darkColor="transparent">
              <Text style={textStyle}>{`${numberedMatch[1]}.  `}</Text>
              <Text style={[textStyle, styles.listText]}>{renderInlineBold(numberedMatch[2], `n${index}`)}</Text>
            </View>
          );
        }
        if (line.trim().length === 0) {
          return <View key={index} style={styles.blankLine} />;
        }
        return (
          <Text key={index} style={textStyle}>
            {renderInlineBold(line, `p${index}`)}
          </Text>
        );
      })}
    </>
  );
}

export function ChatBubble({ message }: { message: ChatBubbleMessage }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const tint = Colors[colorScheme].tint;
  const isUser = message.role === 'user';
  const textStyle = isUser ? [styles.bubbleText, styles.bubbleTextUser] : styles.bubbleText;

  const canAct = !message.streaming && message.content.length > 0;
  const actions: ContextMenuAction[] = [
    { label: 'Copy', icon: 'doc.on.doc', onPress: () => Clipboard.setStringAsync(message.content) },
    { label: 'Share', icon: 'square.and.arrow.up', onPress: () => Share.share({ message: message.content }) },
  ];

  const bubble = (
    <View
      style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}
      lightColor={isUser ? tint : '#fff'}
      darkColor={isUser ? tint : 'rgba(255,255,255,0.06)'}
    >
      {message.streaming && message.content.length === 0 ? (
        <Text style={textStyle}>{'…'}</Text>
      ) : (
        <FormattedContent content={message.content} textStyle={textStyle} />
      )}
      {message.streaming && message.content.length > 0 && (
        <ActivityIndicator size="small" color={isUser ? '#fff' : tint} style={styles.inlineSpinner} />
      )}
      {message.citations && message.citations.length > 0 && (
        <Text style={[styles.meta, isDark ? styles.metaDark : styles.metaLight]}>Sources: {message.citations.join(', ')}</Text>
      )}
      {message.toolsUsed && message.toolsUsed.length > 0 && (
        <View style={styles.toolsUsedRow} lightColor="transparent" darkColor="transparent">
          <Icon name="checkmark.circle" size={11} color={semanticColors.neutral} />
          <Text style={[styles.meta, isDark ? styles.metaDark : styles.metaLight]}>{message.toolsUsed.join(', ')}</Text>
        </View>
      )}
      {message.error && <Text style={styles.error}>{message.error}</Text>}
    </View>
  );

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]} lightColor="transparent" darkColor="transparent">
      {!isUser && (
        <View style={[styles.avatar, { backgroundColor: tint }]}>
          <Icon name="sparkles" size={13} color="#fff" />
        </View>
      )}
      {canAct ? (
        <ContextMenu actions={actions} style={styles.bubbleWrap}>
          {bubble}
        </ContextMenu>
      ) : (
        bubble
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: spacing.md + 2, gap: spacing.sm },
  rowUser: { justifyContent: 'flex-end' },
  rowAssistant: { justifyContent: 'flex-start' },
  avatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  bubbleWrap: { maxWidth: '78%' },
  bubble: { padding: spacing.md + 1, borderRadius: radius.lg + 2, maxWidth: '78%', ...shadows.card },
  userBubble: { borderBottomRightRadius: 4 },
  assistantBubble: { borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextUser: { color: '#fff' },
  bold: { fontWeight: '700' },
  listRow: { flexDirection: 'row', alignItems: 'flex-start' },
  listText: { flex: 1 },
  blankLine: { height: spacing.xs },
  inlineSpinner: { alignSelf: 'flex-start', marginTop: 6 },
  meta: { fontSize: 11, marginTop: 8 },
  metaLight: { color: '#666' },
  metaDark: { color: '#aaa' },
  toolsUsedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  error: { fontSize: 13, color: semanticColors.danger, marginTop: 6, fontWeight: '500' },
});
