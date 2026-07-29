import { MaterialCommunityIcons } from "@expo/vector-icons";
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
  palette,
  radius,
  spacing,
  type,
} from "@/constants/theme";
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
      <View style={styles.root}>
        <Pressable
          accessibilityLabel="Close category picker"
          onPress={onClose}
          style={styles.backdrop}
        />
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>
                Pick one category for this Patch.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close category picker"
              hitSlop={10}
              onPress={onClose}
              style={styles.close}
            >
              <MaterialCommunityIcons
                name="close"
                color={palette.ink}
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
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onSelect(option);
                    onClose();
                  }}
                  style={[styles.option, selected && styles.optionSelected]}
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
                      color={palette.white}
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

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: palette.overlay },
  sheet: {
    maxHeight: "76%",
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  handle: {
    alignSelf: "center",
    backgroundColor: palette.border,
    borderRadius: radius.pill,
    height: 5,
    marginTop: spacing.xs,
    width: 42,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 20,
    fontWeight: "900",
  },
  subtitle: { color: palette.inkMuted, fontSize: 12, marginTop: 3 },
  close: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    padding: spacing.lg,
  },
  option: {
    alignItems: "center",
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "space-between",
    minHeight: 50,
    paddingHorizontal: spacing.md,
    width: "48%",
  },
  optionSelected: { backgroundColor: palette.blue, borderColor: palette.blue },
  optionText: { color: palette.ink, fontSize: 13, fontWeight: "800" },
  optionTextSelected: { color: palette.white },
});
