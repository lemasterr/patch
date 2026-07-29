import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { palette, radius, spacing, type } from "@/constants/theme";
import { createSerializedMutationQueue } from "@/lib/serialized-mutation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import { usePatchNotifications } from "@/providers/notification-provider";
import { useOffline } from "@/providers/offline-provider";
import { type ThemePreference, useTheme } from "@/providers/theme-provider";
import type { Database } from "@/types/database";

type SettingsState = {
  in_app_notifications: boolean;
  like_notifications: boolean;
  browser_notifications: boolean;
  push_notifications: boolean;
  push_likes: boolean;
  push_friend_requests: boolean;
  push_friend_accepted: boolean;
  push_patch_ready: boolean;
  push_travel_awards: boolean;
  default_visibility: "public" | "private";
  is_discoverable: boolean;
  map_is_public: boolean;
};

type Section =
  "account" | "appearance" | "privacy" | "notifications" | "offline";

const sectionMeta: Record<Section, { title: string; intro: string }> = {
  account: {
    title: "Account",
    intro: "Manage your profile, sign-in, and account data.",
  },
  appearance: {
    title: "Appearance",
    intro: "Choose the look that feels right in every Patch screen.",
  },
  privacy: {
    title: "Privacy & safety",
    intro: "Control who can find you and what you share.",
  },
  notifications: {
    title: "Notifications",
    intro: "Keep the useful updates and turn off the noise.",
  },
  offline: {
    title: "Offline & sync",
    intro: "Patch keeps changes safe until there is a connection.",
  },
};

function isSection(value: string | undefined): value is Section {
  return Boolean(value && value in sectionMeta);
}

export default function SettingsSectionScreen() {
  const { section: rawSection } = useLocalSearchParams<{ section?: string }>();
  const section = isSection(rawSection) ? rawSection : "account";
  const { session, profile, refreshProfile } = useAuth();
  const { pushRegistration, refreshPreferences } = usePatchNotifications();
  const {
    completedResults,
    consumeCompletedResult,
    discard,
    isOnline,
    operationCounts,
    operations,
    pendingCount,
    refreshQueue,
    retry,
  } = useOffline();
  const { preference, setPreference } = useTheme();
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settingsLoadError, setSettingsLoadError] = useState(false);
  const [settingsReload, setSettingsReload] = useState(0);
  const settingsOwnerId = useRef<string | null>(null);
  const settingVersions = useRef(new Map<string, number>());
  const settingQueue = useRef(createSerializedMutationQueue());

  useEffect(() => {
    let active = true;
    const clearSettings = () => {
      void Promise.resolve().then(() => {
        if (!active) return;
        setSettings(null);
        setSettingsLoadError(false);
      });
    };
    const ownerId = session?.user.id;
    if (!ownerId) {
      settingsOwnerId.current = null;
      clearSettings();
      return () => {
        active = false;
      };
    }
    if (settingsOwnerId.current !== ownerId) {
      settingsOwnerId.current = ownerId;
      clearSettings();
    }
    void supabase
      .from("user_settings")
      .select(
        "in_app_notifications, like_notifications, browser_notifications, push_notifications, push_likes, push_friend_requests, push_friend_accepted, push_patch_ready, push_travel_awards, default_visibility",
      )
      .eq("user_id", ownerId)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setSettingsLoadError(true);
          return;
        }
        setSettingsLoadError(false);
        setSettings({
          ...data,
          is_discoverable: profile?.is_discoverable ?? true,
          map_is_public: profile?.map_is_public ?? false,
        });
      });
    return () => {
      active = false;
    };
  }, [
    profile?.is_discoverable,
    profile?.map_is_public,
    session,
    settingsReload,
  ]);

  function enqueueSettingWrite(key: string, write: () => Promise<void>) {
    return settingQueue.current.enqueue(key, write);
  }

  function nextSettingVersion(key: string) {
    const next = (settingVersions.current.get(key) ?? 0) + 1;
    settingVersions.current.set(key, next);
    return next;
  }

  async function updateFriendPushPreferences(value: boolean) {
    if (!session || !settings) return;
    const key = "push_friend_preferences";
    const version = nextSettingVersion(key);
    const previous = {
      push_friend_requests: settings.push_friend_requests,
      push_friend_accepted: settings.push_friend_accepted,
    };
    setSettings((current) =>
      current
        ? {
            ...current,
            push_friend_requests: value,
            push_friend_accepted: value,
          }
        : current,
    );
    setMessage(null);
    await enqueueSettingWrite(key, async () => {
      const { error } = await supabase
        .from("user_settings")
        .update({
          push_friend_requests: value,
          push_friend_accepted: value,
        })
        .eq("user_id", session.user.id);
      if (error && settingVersions.current.get(key) === version) {
        setSettings((current) =>
          current
            ? {
                ...current,
                push_friend_requests: previous.push_friend_requests,
                push_friend_accepted: previous.push_friend_accepted,
              }
            : current,
        );
        setMessage("Could not save this setting.");
      }
    });
  }

  async function updateSetting<
    K extends keyof Omit<SettingsState, "is_discoverable" | "map_is_public">,
  >(key: K, value: SettingsState[K]) {
    if (!session || !settings) return;
    const version = nextSettingVersion(key);
    const previousValue = settings[key];
    setSettings((current) =>
      current ? { ...current, [key]: value } : current,
    );
    setMessage(null);
    const update = {
      [key]: value,
    } as Database["public"]["Tables"]["user_settings"]["Update"];
    await enqueueSettingWrite(key, async () => {
      const { error } = await supabase
        .from("user_settings")
        .update(update)
        .eq("user_id", session.user.id);
      if (error) {
        if (settingVersions.current.get(key) !== version) return;
        setSettings((current) =>
          current ? { ...current, [key]: previousValue } : current,
        );
        setMessage("Could not save this setting.");
        return;
      }
      if (
        settingVersions.current.get(key) === version &&
        (key === "in_app_notifications" || key === "push_notifications")
      ) {
        await refreshPreferences();
      }
    });
  }

  async function updateProfileSetting(
    key: "is_discoverable" | "map_is_public",
    value: boolean,
  ) {
    if (!session || !settings) return;
    const version = nextSettingVersion(key);
    const previousValue = settings[key];
    setSettings((current) =>
      current ? { ...current, [key]: value } : current,
    );
    setMessage(null);
    const update =
      key === "is_discoverable"
        ? { is_discoverable: value }
        : { map_is_public: value };
    await enqueueSettingWrite(key, async () => {
      const { error } = await supabase
        .from("profiles")
        .update(update)
        .eq("id", session.user.id);
      if (error) {
        if (settingVersions.current.get(key) !== version) return;
        setSettings((current) =>
          current ? { ...current, [key]: previousValue } : current,
        );
        setMessage("Could not save this setting.");
        return;
      }
      if (settingVersions.current.get(key) === version) {
        await refreshProfile();
      }
    });
  }

  async function updateTheme(value: ThemePreference) {
    setMessage(null);
    try {
      await setPreference(value);
    } catch {
      setMessage("Could not save your appearance preference.");
    }
  }

  const body = (() => {
    if (section === "account") {
      return (
        <View style={styles.stack}>
          <NavigationCard
            icon="account-edit-outline"
            title="Edit profile"
            body="Name, username, bio, and avatar."
            onPress={() => router.push("/profile-edit")}
          />
          <NavigationCard
            icon="shield-account-outline"
            title="Email & password"
            body={session?.user.email ?? "Manage your sign-in"}
            onPress={() => router.push("/account-security")}
          />
          <NavigationCard
            danger
            icon="delete-outline"
            title="Delete account"
            body="Permanently remove your Patch data."
            onPress={() => router.push("/delete-account")}
          />
        </View>
      );
    }
    if (section === "appearance") {
      return (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Theme</Text>
          <View style={styles.themeChoices}>
            {(["system", "light", "dark"] as const).map((value) => {
              const active = preference === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => void updateTheme(value)}
                  style={[
                    styles.themeChoice,
                    active && styles.themeChoiceActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={
                      value === "system"
                        ? "theme-light-dark"
                        : value === "light"
                          ? "white-balance-sunny"
                          : "weather-night"
                    }
                    color={active ? palette.white : palette.blue}
                    size={20}
                  />
                  <Text
                    style={[
                      styles.themeChoiceText,
                      active && styles.themeChoiceTextActive,
                    ]}
                  >
                    {value[0]?.toUpperCase() + value.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    }
    if (section === "privacy" && settings) {
      return (
        <View style={styles.stack}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Profile visibility</Text>
            <SettingToggle
              icon="compass-outline"
              title="Discoverable profile"
              body="Allow other travelers to find and open your profile."
              value={settings.is_discoverable}
              onValueChange={(value) =>
                void updateProfileSetting("is_discoverable", value)
              }
            />
            <SettingToggle
              icon="map-outline"
              title="Show travel map"
              body="Share countries, never dates or notes."
              value={settings.map_is_public}
              onValueChange={(value) =>
                void updateProfileSetting("map_is_public", value)
              }
            />
            <Text style={styles.rowTitle}>Default Patch visibility</Text>
            <View style={styles.visibilityChoices}>
              {(["public", "private"] as const).map((value) => {
                const active = settings.default_visibility === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() =>
                      void updateSetting("default_visibility", value)
                    }
                    style={[
                      styles.visibilityChoice,
                      active && styles.visibilityChoiceActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.visibilityText,
                        active && styles.visibilityTextActive,
                      ]}
                    >
                      {value === "public" ? "Public" : "Private"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <NavigationCard
            icon="eye-off-outline"
            title="Hidden Patches"
            body="Restore Patches hidden from your collection and public views."
            onPress={() => router.push("/(tabs)/collection?hidden=1")}
          />
          <NavigationCard
            icon="account-cancel-outline"
            title="Blocked travelers"
            body="Review or unblock people you have blocked."
            onPress={() => router.push("/blocked-users")}
          />
        </View>
      );
    }
    if (section === "notifications" && settings) {
      return (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>What reaches you</Text>
          <SettingToggle
            icon="bell-outline"
            title="In-app notifications"
            body="Patch and social updates while you are in Patch."
            value={settings.in_app_notifications}
            onValueChange={(value) =>
              void updateSetting("in_app_notifications", value)
            }
          />
          <SettingToggle
            icon="heart-outline"
            title="Likes"
            body="Notify when someone likes your Patch."
            value={settings.like_notifications}
            onValueChange={(value) =>
              void updateSetting("like_notifications", value)
            }
          />
          <SettingToggle
            icon="cellphone-message"
            title="Remote push"
            body={pushRegistration.message}
            value={settings.push_notifications}
            disabled={pushRegistration.status === "feature_paused"}
            onValueChange={(value) =>
              void updateSetting("push_notifications", value)
            }
          />
          <SettingToggle
            icon="heart-outline"
            title="Push likes"
            body="Remote alerts when someone likes your Patch."
            value={settings.push_likes}
            onValueChange={(value) => void updateSetting("push_likes", value)}
          />
          <SettingToggle
            icon="account-plus-outline"
            title="Friend requests"
            body="Requests and accepted-friend alerts."
            value={
              settings.push_friend_requests && settings.push_friend_accepted
            }
            onValueChange={(value) => void updateFriendPushPreferences(value)}
          />
          <SettingToggle
            icon="image-check-outline"
            title="Patch ready"
            body="Remote alerts when generation is ready."
            value={settings.push_patch_ready}
            onValueChange={(value) =>
              void updateSetting("push_patch_ready", value)
            }
          />
          <SettingToggle
            icon="map-outline"
            title="Travel awards"
            body="Remote alerts for world unlocks."
            value={settings.push_travel_awards}
            onValueChange={(value) =>
              void updateSetting("push_travel_awards", value)
            }
          />
        </View>
      );
    }
    if (section === "offline") {
      const deadOperations = operations.filter(
        (operation) => operation.state === "dead",
      );
      const createdPatches = completedResults.flatMap((item) => {
        const achievementId = item.result.achievementId;
        return typeof achievementId === "string"
          ? [{ operationId: item.operationId, achievementId }]
          : [];
      });
      return (
        <View style={styles.panel}>
          <View style={styles.offlineHeading}>
            <View style={styles.largeIcon}>
              <MaterialCommunityIcons
                name={isOnline ? "cloud-check-outline" : "cloud-off-outline"}
                color={palette.blue}
                size={28}
              />
            </View>
            <View style={styles.copy}>
              <Text style={styles.panelTitle}>
                {isOnline ? "Ready to sync" : "Offline"}
              </Text>
              <Text style={styles.offlineCopy}>
                {pendingCount
                  ? `${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting to sync.`
                  : "All queued changes are synced."}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={!isOnline || pendingCount === 0}
            onPress={() => void refreshQueue()}
            style={[
              styles.syncButton,
              (!isOnline || pendingCount === 0) && styles.syncButtonDisabled,
            ]}
          >
            <Text style={styles.syncText}>
              {pendingCount ? "Sync queued changes" : "Nothing waiting to sync"}
            </Text>
          </Pressable>
          {operationCounts.dead ? (
            <View style={styles.offlineStatus}>
              <Text style={styles.offlineStatusText}>
                {operationCounts.dead} change
                {operationCounts.dead === 1 ? " needs" : "s need"} your
                attention.
              </Text>
              {deadOperations.map((operation) => (
                <View key={operation.id} style={styles.offlineOperation}>
                  <View style={styles.copy}>
                    <Text style={styles.rowTitle}>
                      {offlineOperationLabel(operation.operationType)}
                    </Text>
                    <Text style={styles.offlineCopy}>
                      It could not be completed automatically.
                    </Text>
                  </View>
                  <View style={styles.operationActions}>
                    <Pressable
                      accessibilityLabel={`Retry ${offlineOperationLabel(operation.operationType)}`}
                      onPress={() => void retry(operation.id)}
                      style={styles.operationButton}
                    >
                      <Text style={styles.operationButtonText}>Retry</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Remove ${offlineOperationLabel(operation.operationType)}`}
                      onPress={() => void discard(operation.id)}
                      style={styles.operationButton}
                    >
                      <Text style={styles.operationButtonText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {createdPatches.map(({ achievementId, operationId }) => (
            <View key={operationId} style={styles.offlineOperation}>
              <View style={styles.copy}>
                <Text style={styles.rowTitle}>Patch created</Text>
                <Text style={styles.offlineCopy}>
                  Your offline Patch is ready to view.
                </Text>
              </View>
              <Pressable
                accessibilityLabel="View created Patch"
                onPress={() => {
                  void consumeCompletedResult(operationId).then(() =>
                    router.push(`/reveal/${achievementId}`),
                  );
                }}
                style={styles.operationButton}
              >
                <Text style={styles.operationButtonText}>View</Text>
              </Pressable>
            </View>
          ))}
        </View>
      );
    }
    if (settingsLoadError) {
      return (
        <View style={styles.errorState}>
          <Text style={styles.message}>Could not load these settings.</Text>
          <Pressable
            onPress={() => {
              setSettingsLoadError(false);
              setSettings(null);
              setSettingsReload((value) => value + 1);
            }}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <ActivityIndicator
        color={palette.blue}
        size="large"
        style={styles.loader}
      />
    );
  })();

  const meta = sectionMeta[section];
  return (
    <Screen>
      <PatchHeader back title={meta.title} showNotifications={false} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {body}
        {message ? (
          <Text accessibilityRole="alert" style={styles.message}>
            {message}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function offlineOperationLabel(operationType: string) {
  const labels: Record<string, string> = {
    apply_discover_action: "Discover feedback",
    create_patch: "Create Patch",
    record_discover_engagement: "Discover feedback",
    undo_discover_action: "Discover feedback",
  };
  return labels[operationType] ?? "Saved change";
}

function NavigationCard({
  icon,
  title,
  body,
  danger = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  title: string;
  body?: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.navCard, pressed && styles.pressed]}
    >
      <View style={[styles.smallIcon, danger && styles.dangerIcon]}>
        <MaterialCommunityIcons
          name={icon}
          color={danger ? palette.red : palette.blue}
          size={20}
        />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.navTitle, danger && styles.dangerText]}>
          {title}
        </Text>
        {body ? <Text style={styles.navBody}>{body}</Text> : null}
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        color={palette.inkMuted}
        size={21}
      />
    </Pressable>
  );
}

function SettingToggle({
  icon,
  title,
  body,
  value,
  onValueChange,
  disabled = false,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  title: string;
  body?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.smallIcon}>
        <MaterialCommunityIcons name={icon} color={palette.blue} size={19} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {body ? <Text style={styles.rowBody}>{body}</Text> : null}
      </View>
      <Switch
        disabled={disabled}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: palette.surfaceMuted, true: palette.blueBright }}
        thumbColor={palette.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm, paddingBottom: spacing.xxl },
  loader: { marginTop: spacing.xl },
  errorState: { alignItems: "center", gap: spacing.sm, padding: spacing.lg },
  retryButton: {
    backgroundColor: palette.blue,
    borderRadius: radius.pill,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { color: palette.white, fontSize: 13, fontWeight: "900" },
  stack: {},
  panel: {
    gap: 0,
  },
  panelTitle: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 16,
    fontWeight: "900",
  },
  navCard: {
    alignItems: "center",
    borderBottomColor: palette.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  smallIcon: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  largeIcon: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  dangerIcon: { backgroundColor: "rgba(212, 81, 101, 0.14)" },
  copy: { flex: 1, minWidth: 0 },
  navTitle: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 14,
    fontWeight: "900",
  },
  navBody: { color: palette.inkMuted, fontSize: 12, lineHeight: 17 },
  dangerText: { color: palette.red },
  toggleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    borderBottomColor: palette.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  rowTitle: { color: palette.ink, fontSize: 13, fontWeight: "900" },
  rowBody: { color: palette.inkMuted, fontSize: 12, lineHeight: 17 },
  themeChoices: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  themeChoice: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    flex: 1,
    gap: 5,
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  themeChoiceActive: { backgroundColor: palette.blue },
  themeChoiceText: { color: palette.ink, fontSize: 11, fontWeight: "900" },
  themeChoiceTextActive: { color: palette.white },
  visibilityChoices: { flexDirection: "row", gap: spacing.xs },
  visibilityChoice: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
  },
  visibilityChoiceActive: { backgroundColor: palette.blue },
  visibilityText: { color: palette.ink, fontSize: 12, fontWeight: "900" },
  visibilityTextActive: { color: palette.white },
  offlineHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  offlineCopy: { color: palette.inkMuted, fontSize: 12, marginTop: 2 },
  offlineStatus: {
    backgroundColor: "rgba(212, 81, 101, 0.1)",
    borderRadius: radius.md,
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  offlineStatusText: { color: palette.red, fontSize: 12, fontWeight: "800" },
  offlineOperation: {
    alignItems: "center",
    borderBottomColor: palette.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  operationActions: { flexDirection: "row", gap: spacing.xs },
  operationButton: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: spacing.sm,
  },
  operationButtonText: { color: palette.ink, fontSize: 12, fontWeight: "900" },
  syncButton: {
    alignItems: "center",
    backgroundColor: palette.blue,
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 50,
    marginTop: spacing.xs,
  },
  syncButtonDisabled: { opacity: 0.46 },
  syncText: { color: palette.white, fontSize: 13, fontWeight: "900" },
  message: { color: palette.red, fontSize: 12, textAlign: "center" },
  pressed: { opacity: 0.68 },
});
