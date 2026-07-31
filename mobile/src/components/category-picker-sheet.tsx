import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  categoryLabels,
  radius,
  spacing,
  type,
  type SemanticPalette,
} from "@/constants/theme";
import { useTheme } from "@/providers/theme-provider";
import type { AchievementCategory } from "@/types/domain";

const categories = Object.keys(categoryLabels) as AchievementCategory[];

type CategoryValue = AchievementCategory | "all";

export function CategoryPickerSheet({
  visible,
  value,
  onSelect,
  onClose,
  title = "Choose a category",
  includeAll = false,
}: {
  visible: boolean;
  value: CategoryValue;
  onSelect: (value: CategoryValue) => void;
  onClose: () => void;
  title?: string;
  includeAll?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const options: CategoryValue[] = includeAll
    ? ["all", ...categories]
    : categories;

  return (
    <Modal
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View accessibilityViewIsModal style={styles.root}>
        <Pressable
          accessibilityLabel="Close category picker"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <Pressable
              accessibilityLabel="Close category picker"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={styles.close}
            >
              <MaterialCommunityIcons
                name="close"
                color={colors.ink}
                size={20}
              />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
          >
            {options.map((option) => {
              const selected = value === option;
              const label =
                option === "all" ? "All categories" : categoryLabels[option];
              return (
                <Pressable
                  key={option}
                  accessibilityLabel={label}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onSelect(option);
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    selected && styles.optionSelected,
                    pressed && styles.optionPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selected && styles.optionTextSelected,
                    ]}
                  >
                    {label}
                  </Text>
                  {selected ? (
                    <MaterialCommunityIcons
                      name="check"
                      color={colors.blue}
                      size={18}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function createStyles(colors: SemanticPalette) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: "flex-end" },
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
    sheet: {
      maxHeight: "76%",
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
    },
    handle: {
      alignSelf: "center",
      backgroundColor: colors.border,
      borderRadius: radius.pill,
      height: 5,
      marginTop: spacing.xs,
      width: 42,
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.md,
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    title: {
      color: colors.ink,
      flex: 1,
      fontFamily: type.rounded,
      fontSize: 20,
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
    grid: { paddingBottom: spacing.lg },
    option: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 56,
      paddingHorizontal: spacing.lg,
    },
    optionSelected: { backgroundColor: colors.surfaceMuted },
    optionPressed: { opacity: 0.66 },
    optionText: { color: colors.ink, fontSize: 15, fontWeight: "800" },
    optionTextSelected: { color: colors.ink },
  });
}
