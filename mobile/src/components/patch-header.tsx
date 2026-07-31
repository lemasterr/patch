import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radius, spacing, type, type SemanticPalette } from "@/constants/theme";
import { usePatchNotifications } from "@/providers/notification-provider";
import { useTheme } from "@/providers/theme-provider";

type PatchHeaderProps = {
  title?: string;
  subtitle?: string;
  back?: boolean;
  showLogo?: boolean;
  right?: React.ReactNode;
  transparent?: boolean;
  showNotifications?: boolean;
};

export function PatchHeader({
  title = "Patch",
  back = false,
  right,
  transparent = false,
  // Activity belongs to the two primary social surfaces. Keeping this opt-in
  // prevents a bell from competing with back/actions on detail and form
  // screens.
  showNotifications = false,
}: PatchHeaderProps) {
  const styles = usePatchHeaderStyles();
  return (
    <View style={[styles.root, transparent && styles.transparent]}>
      <View style={styles.leading}>
        {back ? (
          <HeaderIcon
            icon="chevron-left"
            label="Go back"
            onPress={() => router.back()}
          />
        ) : null}
      </View>
      <View pointerEvents="none" style={styles.centerTitle}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      </View>
      <View style={styles.actions}>
        {right}
        {showNotifications ? <NotificationButton /> : null}
      </View>
    </View>
  );
}

export function NotificationButton({ unreadCount }: { unreadCount?: number }) {
  const notifications = usePatchNotifications();
  const styles = usePatchHeaderStyles();
  const count = unreadCount ?? notifications.unreadCount;

  return (
    <View>
      <HeaderIcon
        icon="bell-outline"
        label="Notifications"
        onPress={() => router.push("/notifications")}
      />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? "9+" : count}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function HeaderIcon({
  icon,
  label,
  onPress,
  dark = false,
  disabled = false,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  onPress: () => void;
  dark?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = usePatchHeaderStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={24}
        color={dark ? colors.white : colors.ink}
      />
    </Pressable>
  );
}

function usePatchHeaderStyles() {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors]);
}

function createStyles(colors: SemanticPalette) {
  return StyleSheet.create({
    root: {
      height: 58,
      paddingHorizontal: spacing.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    transparent: { backgroundColor: "transparent" },
    leading: { width: 48, alignItems: "flex-start" },
    centerTitle: {
      position: "absolute",
      left: 72,
      right: 72,
      alignItems: "center",
    },
    title: {
      color: colors.ink,
      fontFamily: type.rounded,
      fontSize: 18,
      lineHeight: 22,
      fontWeight: "900",
      letterSpacing: -0.35,
    },
    actions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    iconButton: {
      width: 42,
      height: 42,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    pressed: { opacity: 0.55, transform: [{ scale: 0.94 }] },
    disabled: { opacity: 0.45 },
    badge: {
      position: "absolute",
      right: 1,
      top: 1,
      minWidth: 17,
      height: 17,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: colors.red,
      borderWidth: 2,
      borderColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { color: colors.white, fontSize: 9, fontWeight: "800" },
  });
}
