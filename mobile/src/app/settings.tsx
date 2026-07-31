import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { spacing, type, type SemanticPalette } from "@/constants/theme";
import { useOffline } from "@/providers/offline-provider";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";

type Destination = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  key: string;
  title: string;
  value?: string;
  onPress: () => void;
};

type SettingsGroup = {
  label: string;
  destinations: Destination[];
};

function preferenceLabel(preference: "system" | "light" | "dark") {
  return preference[0]?.toUpperCase() + preference.slice(1);
}

export default function SettingsScreen() {
  const { profile } = useAuth();
  const { isOnline, pendingCount } = useOffline();
  const { colors, preference } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const appVersion = Constants.expoConfig?.version ?? "0.2.0";
  const syncValue = pendingCount
    ? `${pendingCount} pending`
    : isOnline
      ? "Up to date"
      : "Offline";
  const privacyValue = profile?.is_discoverable ? "Discoverable" : "Private";

  const groups: SettingsGroup[] = [
    {
      label: "Account",
      destinations: [
        {
          key: "profile",
          icon: "account-edit-outline",
          title: "Profile",
          onPress: () => router.push("/profile-edit"),
        },
        {
          key: "security",
          icon: "shield-account-outline",
          title: "Security",
          onPress: () => router.push("/account-security"),
        },
        {
          key: "swipe-guide",
          icon: "gesture-swipe",
          title: "Swipe guide",
          onPress: () => router.push("/(tabs)/discover?guide=manual"),
        },
      ],
    },
    {
      label: "Privacy",
      destinations: [
        {
          key: "privacy",
          icon: "shield-account-outline",
          title: "Privacy & safety",
          value: privacyValue,
          onPress: () => router.push("/settings/privacy"),
        },
      ],
    },
    {
      label: "Notifications",
      destinations: [
        {
          key: "notifications",
          icon: "bell-outline",
          title: "Notifications",
          onPress: () => router.push("/settings/notifications"),
        },
      ],
    },
    {
      label: "Appearance",
      destinations: [
        {
          key: "appearance",
          icon: "palette-outline",
          title: "Theme",
          value: preferenceLabel(preference),
          onPress: () => router.push("/settings/appearance"),
        },
      ],
    },
    {
      label: "Sync",
      destinations: [
        {
          key: "offline",
          icon: "cloud-sync-outline",
          title: "Offline & sync",
          value: syncValue,
          onPress: () => router.push("/settings/offline"),
        },
      ],
    },
    {
      label: "About",
      destinations: [
        {
          key: "version",
          icon: "information-outline",
          title: "Version",
          value: appVersion,
          onPress: () => undefined,
        },
      ],
    },
  ];

  return (
    <Screen>
      <PatchHeader back title="Settings" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {groups.map((group) => (
          <View key={group.label} style={styles.group}>
            <Text style={styles.groupLabel}>{group.label}</Text>
            {group.destinations.map((item, index) => {
              const isInformational = item.key === "version";
              return (
                <Pressable
                  key={item.key}
                  accessibilityLabel={
                    isInformational
                      ? `Patch version ${item.value}`
                      : `Open ${item.title}`
                  }
                  accessibilityRole={isInformational ? "text" : "button"}
                  disabled={isInformational}
                  onPress={item.onPress}
                  style={({ pressed }) => [
                    styles.row,
                    index > 0 && styles.rowWithDivider,
                    pressed && !isInformational && styles.pressed,
                  ]}
                >
                  <View style={styles.icon}>
                    <MaterialCommunityIcons
                      color={colors.blue}
                      name={item.icon}
                      size={21}
                    />
                  </View>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  {item.value ? (
                    <Text numberOfLines={1} style={styles.value}>
                      {item.value}
                    </Text>
                  ) : null}
                  {!isInformational ? (
                    <MaterialCommunityIcons
                      color={colors.inkMuted}
                      name="chevron-right"
                      size={21}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function createStyles(colors: SemanticPalette) {
  return StyleSheet.create({
    content: {
      gap: spacing.md,
      paddingBottom: spacing.xxl,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
    },
    group: { gap: spacing.xs },
    groupLabel: {
      color: colors.inkMuted,
      fontFamily: type.rounded,
      fontSize: 13,
      fontWeight: "800",
      letterSpacing: 0.2,
      paddingHorizontal: spacing.xs,
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: 56,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.sm,
    },
    rowWithDivider: {
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      marginLeft: 46,
      paddingLeft: 0,
    },
    icon: {
      alignItems: "center",
      height: 28,
      justifyContent: "center",
      width: 28,
    },
    rowTitle: {
      color: colors.ink,
      flex: 1,
      fontFamily: type.rounded,
      fontSize: 16,
      fontWeight: "800",
    },
    value: {
      color: colors.inkMuted,
      flexShrink: 1,
      fontSize: 14,
      textAlign: "right",
    },
    pressed: { opacity: 0.64 },
  });
}
