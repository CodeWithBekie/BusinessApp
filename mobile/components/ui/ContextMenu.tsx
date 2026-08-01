import { ReactNode, useState } from 'react';
import { Modal, Pressable, PressableProps, StyleSheet } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { Text, View } from '@/components/Themed';
import { Icon } from '@/components/ui/Icon';
import { radius, semanticColors, shadows, spacing } from '@/constants/theme';

export interface ContextMenuAction {
  label: string;
  icon?: SFSymbol;
  destructive?: boolean;
  onPress: () => void;
}

// The mobile equivalent of a right-click context menu — a single Pressable handling both the
// card's normal tap (onPress) and a long-press that opens a bottom-sheet action list. Deliberately
// one Pressable, not a wrapper around the card's own, since nested Pressables with competing
// gesture recognizers (tap vs. long-press) can steal each other's touches.
export function ContextMenu({
  actions,
  onPress,
  style,
  children,
}: {
  actions: ContextMenuAction[];
  onPress?: () => void;
  style?: PressableProps['style'];
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable onPress={onPress} onLongPress={() => setVisible(true)} delayLongPress={350} style={style}>
        {children}
      </Pressable>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <View style={styles.sheet} lightColor="#fff" darkColor="#1c1c1e">
            {actions.map((action, index) => (
              <Pressable
                key={action.label}
                style={[styles.row, index === actions.length - 1 && styles.rowLast]}
                onPress={() => {
                  setVisible(false);
                  action.onPress();
                }}
              >
                {action.icon && (
                  <Icon name={action.icon} size={18} color={action.destructive ? semanticColors.danger : semanticColors.neutral} />
                )}
                <Text style={[styles.label, action.destructive && styles.labelDestructive]}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.xl,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs,
    ...shadows.floating,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.15)',
  },
  rowLast: { borderBottomWidth: 0 },
  label: { fontSize: 15, fontWeight: '600' },
  labelDestructive: { color: semanticColors.danger },
});
