import Constants from "expo-constants";
import { router } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { spacing } from "@/constants/theme";
import { SettingsGroup } from "@/features/settings/settings-group";
import { SettingsRow } from "@/features/settings/settings-row";
import { useAuth } from "@/providers/auth-provider";
import { useOffline } from "@/providers/offline-provider";
import { useTheme } from "@/providers/theme-provider";

function preferenceLabel(preference: "system" | "light" | "dark") {
  return preference[0]?.toUpperCase() + preference.slice(1);
}

export default function SettingsScreen() {
  const { profile } = useAuth();
  const { isOnline, pendingCount } = useOffline();
  const { colors, preference } = useTheme();
  const insets = useSafeAreaInsets();
  const appVersion = Constants.expoConfig?.version ?? "0.2.1";
  const syncValue = pendingCount
    ? `${pendingCount} pending`
    : isOnline
      ? "Up to date"
      : "Offline";
  const rows = useMemo(
    () =>
      [
        [
          "account-edit-outline",
          "Profile",
          undefined,
          () => router.push("/profile-edit"),
        ],
        [
          "shield-account-outline",
          "Security",
          undefined,
          () => router.push("/account-security"),
        ],
        [
          "gesture-swipe",
          "Swipe guide",
          undefined,
          () => router.push("/(tabs)/discover?guide=manual"),
        ],
        [
          "history",
          "Viewing history",
          undefined,
          () => router.push("/viewing-history"),
        ],
        [
          "shield-account-outline",
          "Privacy & safety",
          profile?.is_discoverable ? "Discoverable" : "Private",
          () => router.push("/settings/privacy"),
        ],
        [
          "bell-outline",
          "Notifications",
          undefined,
          () => router.push("/settings/notifications"),
        ],
        [
          "palette-outline",
          "Theme",
          preferenceLabel(preference),
          () => router.push("/settings/appearance"),
        ],
        [
          "cloud-sync-outline",
          "Offline & sync",
          syncValue,
          () => router.push("/settings/offline"),
        ],
      ] as const,
    [preference, profile?.is_discoverable, syncValue],
  );

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
        <SettingsGroup>
          {rows.map(([icon, title, value, onPress], index) => (
            <SettingsRow
              key={title}
              icon={icon}
              title={title}
              value={value}
              onPress={onPress}
              showDivider={index < rows.length - 1}
            />
          ))}
        </SettingsGroup>
        <Text style={[styles.version, { color: colors.inkMuted }]}>
          Patch {appVersion}
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  version: { alignSelf: "center", fontSize: 12, paddingVertical: spacing.sm },
});
