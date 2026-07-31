import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { radius, spacing, type, type SemanticPalette } from "@/constants/theme";
import { useTheme } from "@/providers/theme-provider";

const guideRows = [
  { icon: "arrow-right", label: "Like" },
  { icon: "arrow-left", label: "Not for me" },
  { icon: "arrow-up", label: "Skip" },
  { icon: "arrow-down", label: "Undo" },
  { icon: "gesture-tap", label: "Open" },
] as const;

export function SwipeGuideSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <View accessibilityViewIsModal style={styles.root}>
        <Pressable
          accessibilityLabel="Close swipe guide"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              Swipes
            </Text>
            <Pressable
              accessibilityLabel="Close swipe guide"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.close}
            >
              <MaterialCommunityIcons
                color={colors.ink}
                name="close"
                size={21}
              />
            </Pressable>
          </View>
          <View style={styles.rows}>
            {guideRows.map((row) => (
              <View key={row.label} style={styles.row}>
                <MaterialCommunityIcons
                  color={colors.blue}
                  name={row.icon}
                  size={22}
                />
                <Text style={styles.label}>{row.label}</Text>
              </View>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start exploring Discover"
            onPress={onClose}
            style={({ pressed }) => [
              styles.start,
              pressed && styles.startPressed,
            ]}
          >
            <Text style={styles.startText}>Start</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function createStyles(colors: SemanticPalette) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: "flex-end" },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
    },
    handle: {
      alignSelf: "center",
      backgroundColor: colors.border,
      borderRadius: radius.pill,
      height: 5,
      width: 42,
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    title: {
      color: colors.ink,
      fontFamily: type.rounded,
      fontSize: 24,
      fontWeight: "900",
    },
    close: {
      alignItems: "center",
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.pill,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    rows: {
      borderBottomColor: colors.border,
      borderTopColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    row: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: 48,
    },
    label: { color: colors.ink, fontSize: 16, fontWeight: "800" },
    start: {
      alignItems: "center",
      backgroundColor: colors.blue,
      borderRadius: radius.pill,
      justifyContent: "center",
      marginBottom: spacing.md,
      minHeight: 50,
    },
    startPressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
    startText: { color: colors.white, fontSize: 16, fontWeight: "900" },
  });
}
