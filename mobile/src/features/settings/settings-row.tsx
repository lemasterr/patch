import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text } from "react-native";

import { spacing } from "@/constants/theme";
import { useTheme } from "@/providers/theme-provider";

export function SettingsRow({
  icon,
  title,
  value,
  onPress,
  showDivider = false,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  title: string;
  value?: string;
  onPress: () => void;
  showDivider?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityLabel={`Open ${title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        showDivider && {
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        pressed && styles.pressed,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={21} color={colors.blue} />
      <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      {value ? (
        <Text
          numberOfLines={1}
          style={[styles.value, { color: colors.inkMuted }]}
        >
          {value}
        </Text>
      ) : null}
      <MaterialCommunityIcons
        name="chevron-right"
        size={21}
        color={colors.inkMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 56,
    paddingRight: spacing.sm,
  },
  title: { flex: 1, fontSize: 16, fontWeight: "800" },
  value: { flexShrink: 1, fontSize: 13, textAlign: "right" },
  pressed: { opacity: 0.64 },
});
