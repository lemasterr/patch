import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, spacing, type, type SemanticPalette } from "@/constants/theme";
import { useTheme } from "@/providers/theme-provider";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export type ActionSheetItem = {
  icon: IconName;
  label: string;
  section?: string;
  detail?: string;
  destructive?: boolean;
  onPress: () => void;
};

export function ActionSheet({
  visible,
  title,
  items,
  onClose,
}: {
  visible: boolean;
  title?: string;
  items: ActionSheetItem[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  function run(action: () => void) {
    onClose();
    requestAnimationFrame(action);
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View accessibilityViewIsModal style={styles.root}>
        <Pressable
          accessibilityLabel="Close menu"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xs }]}
        >
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <View style={styles.group}>
            {items.map((item, index) => (
              <View key={`${item.section ?? ""}-${item.label}`}>
                {item.section &&
                (index === 0 || items[index - 1]?.section !== item.section) ? (
                  <Text style={styles.section}>{item.section}</Text>
                ) : null}
                <Pressable
                  accessibilityLabel={
                    item.detail ? `${item.label}. ${item.detail}` : item.label
                  }
                  accessibilityRole="button"
                  onPress={() => run(item.onPress)}
                  style={({ pressed }) => [
                    styles.row,
                    index < items.length - 1 && styles.rowSeparator,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.icon}>
                    <MaterialCommunityIcons
                      name={item.icon}
                      size={20}
                      color={item.destructive ? colors.red : colors.ink}
                    />
                  </View>
                  <View style={styles.copy}>
                    <Text
                      style={[
                        styles.label,
                        item.destructive && styles.labelDestructive,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {item.detail ? (
                      <Text numberOfLines={1} style={styles.detail}>
                        {item.detail}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              </View>
            ))}
          </View>
          <Pressable
            accessibilityLabel="Cancel"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.cancel}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: SemanticPalette) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: "flex-end" },
    backdrop: {
      position: "absolute",
      inset: 0,
      backgroundColor: colors.overlay,
    },
    sheet: {
      paddingTop: 6,
      paddingHorizontal: spacing.md,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: "hidden",
    },
    handle: {
      width: 36,
      height: 4,
      marginTop: 2,
      marginBottom: 4,
      borderRadius: 2,
      alignSelf: "center",
      backgroundColor: colors.border,
    },
    title: {
      paddingHorizontal: spacing.sm,
      paddingBottom: spacing.sm,
      color: colors.inkMuted,
      fontFamily: type.rounded,
      fontSize: 12,
      fontWeight: "800",
    },
    group: {
      borderTopWidth: 0,
    },
    section: {
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.md,
      color: colors.inkMuted,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    row: {
      minHeight: 52,
      paddingHorizontal: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    rowSeparator: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowPressed: { backgroundColor: `${colors.blue}1C` },
    icon: {
      width: 28,
      height: 28,
      borderRadius: 0,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    copy: { flex: 1 },
    label: { color: colors.ink, fontSize: 14, fontWeight: "800" },
    labelDestructive: { color: colors.red },
    detail: { marginTop: 2, color: colors.inkMuted, fontSize: 11 },
    cancel: {
      minHeight: 44,
      marginTop: 2,
      marginBottom: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelText: { color: colors.blue, fontSize: 14, fontWeight: "900" },
  });
}
