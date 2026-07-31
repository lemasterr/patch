import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { radius, spacing, type, type SemanticPalette } from "@/constants/theme";
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
  push_notifications: boolean;
  push_likes: boolean;
  push_friend_requests: boolean;
  push_friend_accepted: boolean;
  push_patch_ready: boolean;
  default_visibility: "public" | "private";
  is_discoverable: boolean;
  map_is_public: boolean;
};

type Section =
  "account" | "appearance" | "privacy" | "notifications" | "offline";

const sectionMeta: Record<Section, { title: string }> = {
  account: { title: "Account" },
  appearance: { title: "Appearance" },
  privacy: { title: "Privacy & safety" },
  notifications: { title: "Notifications" },
  offline: { title: "Offline & sync" },
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
  const { colors, preference, setPreference } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settingsLoadError, setSettingsLoadError] = useState(false);
  const [settingsReload, setSettingsReload] = useState(0);
  const settingsOwnerId = useRef<string | null>(null);
  const activeSessionOwnerId = useRef<string | null>(null);
  const settingVersions = useRef(new Map<string, number>());
  const settingQueue = useRef(createSerializedMutationQueue());

  useLayoutEffect(() => {
    activeSessionOwnerId.current = session?.user.id ?? null;
  }, [session?.user.id]);

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
      settingVersions.current.clear();
      settingQueue.current = createSerializedMutationQueue();
      settingsOwnerId.current = null;
      clearSettings();
      return () => {
        active = false;
      };
    }
    if (settingsOwnerId.current !== ownerId) {
      settingVersions.current.clear();
      settingQueue.current = createSerializedMutationQueue();
      settingsOwnerId.current = ownerId;
      clearSettings();
    }
    void supabase
      .from("user_settings")
      .select(
        "in_app_notifications, like_notifications, push_notifications, push_likes, push_friend_requests, push_friend_accepted, push_patch_ready, default_visibility",
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

  function isCurrentSettingsOwner(ownerId: string) {
    return (
      activeSessionOwnerId.current === ownerId &&
      settingsOwnerId.current === ownerId
    );
  }

  function isCurrentSettingRequest(
    ownerId: string,
    key: string,
    version: number,
  ) {
    return (
      isCurrentSettingsOwner(ownerId) &&
      settingVersions.current.get(key) === version
    );
  }

  function nextSettingVersion(key: string) {
    const next = (settingVersions.current.get(key) ?? 0) + 1;
    settingVersions.current.set(key, next);
    return next;
  }

  async function updateFriendPushPreferences(value: boolean) {
    if (!session || !settings) return;
    const ownerId = session.user.id;
    if (!isCurrentSettingsOwner(ownerId)) return;
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
      if (!isCurrentSettingsOwner(ownerId)) return;
      const { error } = await supabase
        .from("user_settings")
        .update({
          push_friend_requests: value,
          push_friend_accepted: value,
        })
        .eq("user_id", ownerId);
      if (error && isCurrentSettingRequest(ownerId, key, version)) {
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

  async function updateInAppLikePreferences(value: boolean) {
    if (!session || !settings) return;
    const ownerId = session.user.id;
    if (!isCurrentSettingsOwner(ownerId)) return;
    const key = "in_app_like_preferences";
    const version = nextSettingVersion(key);
    const previous = {
      in_app_notifications: settings.in_app_notifications,
      like_notifications: settings.like_notifications,
    };
    setSettings((current) =>
      current
        ? {
            ...current,
            in_app_notifications: value,
            like_notifications: value,
          }
        : current,
    );
    setMessage(null);
    await enqueueSettingWrite(key, async () => {
      if (!isCurrentSettingsOwner(ownerId)) return;
      const { error } = await supabase
        .from("user_settings")
        .update({
          in_app_notifications: value,
          like_notifications: value,
        })
        .eq("user_id", ownerId);
      if (error && isCurrentSettingRequest(ownerId, key, version)) {
        setSettings((current) =>
          current
            ? {
                ...current,
                in_app_notifications: previous.in_app_notifications,
                like_notifications: previous.like_notifications,
              }
            : current,
        );
        setMessage("Could not save this setting.");
        return;
      }
      if (isCurrentSettingRequest(ownerId, key, version)) {
        await refreshPreferences();
      }
    });
  }

  async function updateSetting<
    K extends keyof Omit<SettingsState, "is_discoverable" | "map_is_public">,
  >(key: K, value: SettingsState[K]) {
    if (!session || !settings) return;
    const ownerId = session.user.id;
    if (!isCurrentSettingsOwner(ownerId)) return;
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
      if (!isCurrentSettingsOwner(ownerId)) return;
      const { error } = await supabase
        .from("user_settings")
        .update(update)
        .eq("user_id", ownerId);
      if (error) {
        if (!isCurrentSettingRequest(ownerId, key, version)) return;
        setSettings((current) =>
          current ? { ...current, [key]: previousValue } : current,
        );
        setMessage("Could not save this setting.");
        return;
      }
      if (
        isCurrentSettingRequest(ownerId, key, version) &&
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
    const ownerId = session.user.id;
    if (!isCurrentSettingsOwner(ownerId)) return;
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
      if (!isCurrentSettingsOwner(ownerId)) return;
      const { error } = await supabase
        .from("profiles")
        .update(update)
        .eq("id", ownerId);
      if (error) {
        if (!isCurrentSettingRequest(ownerId, key, version)) return;
        setSettings((current) =>
          current ? { ...current, [key]: previousValue } : current,
        );
        setMessage("Could not save this setting.");
        return;
      }
      if (isCurrentSettingRequest(ownerId, key, version)) {
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
            onPress={() => router.push("/profile-edit")}
          />
          <NavigationCard
            icon="shield-account-outline"
            title="Email & password"
            onPress={() => router.push("/account-security")}
          />
          <NavigationCard
            icon="gesture-swipe"
            title="Swipe guide"
            onPress={() => router.push("/(tabs)/discover?guide=manual")}
          />
          <NavigationCard
            danger
            icon="delete-outline"
            title="Delete account"
            onPress={() => router.push("/delete-account")}
          />
        </View>
      );
    }
    if (section === "appearance") {
      return (
        <View style={styles.panel}>
          <View style={styles.themeChoices}>
            {(["system", "light", "dark"] as const).map((value) => {
              const active = preference === value;
              return (
                <Pressable
                  key={value}
                  accessibilityLabel={`${value[0]?.toUpperCase() + value.slice(1)} theme`}
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
                    color={active ? colors.white : colors.blue}
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
            <SettingToggle
              icon="compass-outline"
              title="Discoverable profile"
              value={settings.is_discoverable}
              onValueChange={(value) =>
                void updateProfileSetting("is_discoverable", value)
              }
            />
            <SettingToggle
              icon="map-outline"
              title="Show travel map"
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
                    accessibilityLabel={`Default visibility: ${value}`}
                    accessibilityRole="radio"
                    accessibilityState={{
                      selected: active,
                    }}
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
            onPress={() => router.push("/(tabs)/collection?hidden=1")}
          />
          <NavigationCard
            icon="account-cancel-outline"
            title="Blocked travelers"
            onPress={() => router.push("/blocked-users")}
          />
        </View>
      );
    }
    if (section === "notifications" && settings) {
      return (
        <View style={styles.panel}>
          <SettingToggle
            icon="bell-outline"
            title="Likes in Patch"
            value={settings.in_app_notifications && settings.like_notifications}
            onValueChange={(value) => void updateInAppLikePreferences(value)}
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
            value={settings.push_likes}
            onValueChange={(value) => void updateSetting("push_likes", value)}
          />
          <SettingToggle
            icon="account-plus-outline"
            title="Friend requests"
            value={
              settings.push_friend_requests && settings.push_friend_accepted
            }
            onValueChange={(value) => void updateFriendPushPreferences(value)}
          />
          <SettingToggle
            icon="image-check-outline"
            title="Patch ready"
            value={settings.push_patch_ready}
            onValueChange={(value) =>
              void updateSetting("push_patch_ready", value)
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
                color={colors.blue}
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
          <Text style={styles.offlineScope}>
            Patch creation and Discover actions are saved for retry. Other
            changes need a connection.
          </Text>
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
        color={colors.blue}
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
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.lg },
        ]}
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
    mark_discover_swipe_guide_seen: "Swipe guide",
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.navCard, pressed && styles.pressed]}
    >
      <View style={[styles.smallIcon, danger && styles.dangerIcon]}>
        <MaterialCommunityIcons
          name={icon}
          color={danger ? colors.red : colors.blue}
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
        color={colors.inkMuted}
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.toggleRow}>
      <View style={styles.smallIcon}>
        <MaterialCommunityIcons name={icon} color={colors.blue} size={19} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {body ? <Text style={styles.rowBody}>{body}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={title}
        disabled={disabled}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.surfaceMuted, true: colors.blueBright }}
        thumbColor={colors.white}
      />
    </View>
  );
}

function createStyles(colors: SemanticPalette) {
  return StyleSheet.create({
    content: { gap: spacing.md, paddingHorizontal: spacing.md },
    loader: { marginTop: spacing.xl },
    errorState: { alignItems: "center", gap: spacing.sm, padding: spacing.lg },
    retryButton: {
      backgroundColor: colors.blue,
      borderRadius: radius.pill,
      minHeight: 42,
      paddingHorizontal: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    retryText: { color: colors.white, fontSize: 13, fontWeight: "900" },
    stack: { gap: spacing.lg },
    panel: {
      gap: spacing.sm,
    },
    panelTitle: {
      color: colors.ink,
      fontFamily: type.rounded,
      fontSize: 16,
      fontWeight: "900",
    },
    navCard: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: 56,
      paddingHorizontal: 0,
    },
    smallIcon: {
      alignItems: "center",
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.md,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    largeIcon: {
      alignItems: "center",
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.md,
      height: 58,
      justifyContent: "center",
      width: 58,
    },
    dangerIcon: { backgroundColor: `${colors.red}24` },
    copy: { flex: 1, minWidth: 0 },
    navTitle: {
      color: colors.ink,
      fontFamily: type.rounded,
      fontSize: 14,
      fontWeight: "900",
    },
    navBody: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
    dangerText: { color: colors.red },
    toggleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      minHeight: 56,
      paddingHorizontal: spacing.md,
    },
    rowTitle: { color: colors.ink, fontSize: 13, fontWeight: "900" },
    rowBody: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
    themeChoices: {
      flexDirection: "row",
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    themeChoice: {
      alignItems: "center",
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.pill,
      flex: 1,
      gap: 5,
      minHeight: 46,
      justifyContent: "center",
      paddingHorizontal: spacing.xs,
    },
    themeChoiceActive: { backgroundColor: colors.blue },
    themeChoiceText: { color: colors.ink, fontSize: 11, fontWeight: "900" },
    themeChoiceTextActive: { color: colors.white },
    visibilityChoices: { flexDirection: "row", gap: spacing.xs },
    visibilityChoice: {
      alignItems: "center",
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.pill,
      flex: 1,
      justifyContent: "center",
      minHeight: 42,
    },
    visibilityChoiceActive: { backgroundColor: colors.blue },
    visibilityText: { color: colors.ink, fontSize: 12, fontWeight: "900" },
    visibilityTextActive: { color: colors.white },
    offlineHeading: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
    },
    offlineCopy: { color: colors.inkMuted, fontSize: 12, marginTop: 2 },
    offlineScope: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
    offlineStatus: {
      backgroundColor: `${colors.red}1A`,
      borderRadius: radius.md,
      gap: spacing.xs,
      marginTop: spacing.sm,
      padding: spacing.sm,
    },
    offlineStatusText: { color: colors.red, fontSize: 12, fontWeight: "800" },
    offlineOperation: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    operationActions: { flexDirection: "row", gap: spacing.xs },
    operationButton: {
      alignItems: "center",
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.pill,
      justifyContent: "center",
      minHeight: 36,
      paddingHorizontal: spacing.sm,
    },
    operationButtonText: { color: colors.ink, fontSize: 12, fontWeight: "900" },
    syncButton: {
      alignItems: "center",
      backgroundColor: colors.blue,
      borderRadius: radius.md,
      justifyContent: "center",
      minHeight: 50,
      marginTop: spacing.xs,
    },
    syncButtonDisabled: { opacity: 0.46 },
    syncText: { color: colors.white, fontSize: 13, fontWeight: "900" },
    message: { color: colors.red, fontSize: 12, textAlign: "center" },
    pressed: { opacity: 0.68 },
  });
}
