import { ScrollView, StyleSheet } from 'react-native';

import { View } from '@/components/Themed';
import { Chip } from '@/components/ui/Chip';
import { spacing } from '@/constants/theme';

const KEYWORD_FOLLOW_UPS: readonly { match: RegExp; prompts: readonly string[] }[] = [
  { match: /profit|sales|revenue|cash/i, prompts: ['Compare to last week', 'What about last month?'] },
  { match: /order/i, prompts: ['Show me more detail', "What's the status?"] },
  { match: /catalog|stock|inventory/i, prompts: ["What's low on stock?", 'Show me the top sellers'] },
  { match: /supplier|purchase/i, prompts: ['Which suppliers are late?', 'Show total spend'] },
  { match: /expense/i, prompts: ['Break that down by category'] },
];

const GENERIC_FOLLOW_UPS: readonly string[] = ['Tell me more', 'What should I do next?'];

// Short, tappable follow-up prompts shown under the latest assistant reply so a conversation keeps
// flowing instead of the user staring at a blank input. Keyed off which tools the reply used
// (already returned by the chat stream) — no extra network call, just a small local heuristic.
function followUpsFor(toolsUsed: string[] | undefined): readonly string[] {
  if (!toolsUsed || toolsUsed.length === 0) return GENERIC_FOLLOW_UPS;
  const joined = toolsUsed.join(' ');
  for (const { match, prompts } of KEYWORD_FOLLOW_UPS) {
    if (match.test(joined)) return prompts;
  }
  return GENERIC_FOLLOW_UPS;
}

export function ChatSuggestionChips({ toolsUsed, onSelect }: { toolsUsed?: string[]; onSelect: (message: string) => void }) {
  const prompts = followUpsFor(toolsUsed);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
      <View style={styles.row} lightColor="transparent" darkColor="transparent">
        {prompts.map((prompt) => (
          <Chip key={prompt} label={prompt} active={false} onPress={() => onSelect(prompt)} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, paddingLeft: 34 },
});
