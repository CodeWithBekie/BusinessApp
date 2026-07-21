import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

// FR21 (Section 6.3) — "AI Business Brain" chat. Phase 0 is a static placeholder; real
// streaming against POST /api/assistant/chat (Sections 10.2, 10.6) is Phase 2.
const PLACEHOLDER_MESSAGES = [
  { from: 'owner', text: 'Why are profits dropping this month?' },
  { from: 'assistant', text: 'AI orchestration not yet implemented — Phase 1/2, see product-spec-v1.3 Section 10.2.' },
];

export default function AssistantScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Business Brain</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      {PLACEHOLDER_MESSAGES.map((message, index) => (
        <View
          key={index}
          style={[styles.bubble, message.from === 'owner' ? styles.ownerBubble : styles.assistantBubble]}
        >
          <Text>{message.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 24, paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: 'bold' },
  separator: { marginVertical: 16, height: 1, width: '100%' },
  bubble: { padding: 12, borderRadius: 8, marginBottom: 8, maxWidth: '85%' },
  ownerBubble: { alignSelf: 'flex-end', backgroundColor: 'rgba(0, 122, 255, 0.15)' },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: 'rgba(120, 120, 120, 0.15)' },
});
