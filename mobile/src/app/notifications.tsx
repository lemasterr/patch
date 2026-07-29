import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { HeaderIcon, PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { SlidingTabs } from "@/components/sliding-tabs";
import { palette, radius, spacing, type } from "@/constants/theme";
import {
  getFriends,
  updateFriendship,
  type FriendProfile,
} from "@/lib/queries";
import { invalidateForMutation, queryKeys } from "@/lib/query-keys";
import { routeForNotificationLink } from "@/lib/notification-route";
import { useAuth } from "@/providers/auth-provider";
import { usePatchNotifications } from "@/providers/notification-provider";
import type { PatchNotification } from "@/types/domain";

function notificationRoute(item: PatchNotification) {
  if (item.type === "achievement_completed" && item.achievement_id)
    return `/reveal/${item.achievement_id}` as const;
  return routeForNotificationLink(item.link);
}

export default function NotificationsScreen() {
  const { profile } = useAuth();
  const {
    error,
    isMarkingRead,
    markingAllRead,
    notifications,
    loading,
    refresh,
    markRead,
    markAllRead,
  } = usePatchNotifications();
  const [tab, setTab] = useState<"activity" | "requests">("activity");
  const [requestError, setRequestError] = useState<string | null>(null);
  const client = useQueryClient();
  const userId = profile?.id ?? "anonymous";
  const requests = useQuery({
    queryKey: queryKeys.social.requests(userId),
    queryFn: () => getFriends("requests"),
    enabled: Boolean(profile && tab === "requests"),
  });

  useFocusEffect(
    useCallback(() => {
      void refresh();
      if (tab === "requests") void requests.refetch();
    }, [refresh, requests, tab]),
  );

  async function act(
    person: FriendProfile,
    action: "accept" | "decline" | "cancel",
  ) {
    const { error } = await updateFriendship(person.id, action);
    if (!error) {
      setRequestError(null);
      void invalidateForMutation(client, "friend");
      void requests.refetch();
    } else {
      setRequestError("Could not update this friend request. Try again.");
    }
  }

  return (
    <Screen>
      <PatchHeader
        back
        title="Notifications"
        subtitle={undefined}
        right={
          tab === "activity" && notifications.length ? (
            <HeaderIcon
              icon="check-all"
              label="Mark all as read"
              disabled={markingAllRead}
              onPress={() => void markAllRead()}
            />
          ) : undefined
        }
      />
      <View style={styles.tabs}>
        <SlidingTabs
          value={tab}
          options={[
            { value: "activity", label: "Activity" },
            { value: "requests", label: "Requests" },
          ]}
          onChange={setTab}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {tab === "requests" && requestError ? (
        <Text style={styles.error}>{requestError}</Text>
      ) : null}
      {tab === "activity" ? (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={() => void refresh()}
          ListEmptyComponent={
            <EmptyState
              icon="bell-sleep-outline"
              title="Quiet for now"
              body="Likes and new Patch updates will appear here."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              disabled={isMarkingRead(item.id)}
              onPress={() => {
                void markRead(item.id);
                router.push(notificationRoute(item));
              }}
              style={({ pressed }) => [
                isMarkingRead(item.id) && styles.pending,
                pressed && !isMarkingRead(item.id) && styles.pressed,
              ]}
            >
              <View style={[styles.item, !item.read_at && styles.itemUnread]}>
                <View style={[styles.icon, !item.read_at && styles.iconUnread]}>
                  <MaterialCommunityIcons
                    name={
                      item.type === "achievement_liked"
                        ? "heart"
                        : item.type === "friend_request"
                          ? "account-plus-outline"
                          : item.type === "friend_accepted"
                            ? "account-check-outline"
                            : item.type === "achievement_failed"
                              ? "alert-outline"
                              : "medal-outline"
                    }
                    size={21}
                    color={!item.read_at ? palette.white : palette.blue}
                  />
                </View>
                <View style={styles.copy}>
                  <Text numberOfLines={1} style={styles.title}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={2} style={styles.body}>
                    {item.body}
                  </Text>
                  <Text style={styles.time}>
                    {formatRelative(item.created_at)}
                  </Text>
                </View>
                {!item.read_at ? (
                  <View style={styles.dot} />
                ) : (
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={21}
                    color={palette.inkMuted}
                  />
                )}
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={requests.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={requests.isRefetching}
          onRefresh={() => void requests.refetch()}
          ListEmptyComponent={
            requests.isPending ? null : requests.isError ? (
              <View style={styles.errorState}>
                <Text style={styles.errorText}>
                  Could not load friend requests.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void requests.refetch()}
                  style={styles.retry}
                >
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : (
              <EmptyState
                icon="account-check-outline"
                title="No friend requests"
                body="New requests and sent invitations appear here."
              />
            )
          }
          renderItem={({ item }) => (
            <View style={styles.requestRow}>
              <Pressable
                onPress={() => router.push(`/user/${item.id}`)}
                style={styles.requestPerson}
              >
                <Avatar size={44} avatarKey={item.avatarKey} />
                <View style={styles.copy}>
                  <Text numberOfLines={1} style={styles.title}>
                    {item.displayName}
                  </Text>
                  <Text numberOfLines={1} style={styles.body}>
                    @{item.username}
                  </Text>
                </View>
              </Pressable>
              {item.relationship === "incoming" ? (
                <View style={styles.requestActions}>
                  <RequestAction
                    label="Accept"
                    onPress={() => void act(item, "accept")}
                  />
                  <RequestAction
                    label="Decline"
                    secondary
                    onPress={() => void act(item, "decline")}
                  />
                </View>
              ) : (
                <RequestAction
                  label="Cancel"
                  secondary
                  onPress={() => void act(item, "cancel")}
                />
              )}
            </View>
          )}
        />
      )}
    </Screen>
  );
}

function RequestAction({
  label,
  secondary = false,
  onPress,
}: {
  label: string;
  secondary?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.requestAction, secondary && styles.requestActionSecondary]}
    >
      <Text
        style={[
          styles.requestActionText,
          secondary && styles.requestActionTextSecondary,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function formatRelative(value: string) {
  const minutes = Math.max(
    1,
    Math.round((Date.now() - new Date(value).getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  error: {
    color: palette.red,
    fontSize: 13,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  errorState: { alignItems: "center", gap: spacing.sm, padding: spacing.lg },
  errorText: { color: palette.inkMuted, fontSize: 14 },
  retry: {
    backgroundColor: palette.blue,
    borderRadius: radius.pill,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  retryText: { color: palette.white, fontSize: 13, fontWeight: "900" },
  list: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  item: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 96,
    padding: spacing.md,
  },
  itemUnread: { backgroundColor: "rgba(74,125,183,0.08)" },
  icon: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: 22,
    height: 43,
    justifyContent: "center",
    width: 43,
  },
  iconUnread: { backgroundColor: palette.blue },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  title: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 15,
    fontWeight: "800",
  },
  body: { color: palette.inkMuted, fontSize: 13, lineHeight: 18 },
  time: { color: palette.blue, fontSize: 11, fontWeight: "700" },
  dot: { backgroundColor: palette.red, borderRadius: 4, height: 8, width: 8 },
  pressed: { opacity: 0.7 },
  pending: { opacity: 0.6 },
  requestRow: {
    alignItems: "center",
    borderBottomColor: palette.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 72,
    paddingVertical: spacing.sm,
  },
  requestPerson: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minWidth: 0,
  },
  requestActions: { flexDirection: "row", gap: 5 },
  requestAction: {
    alignItems: "center",
    backgroundColor: palette.blue,
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: spacing.sm,
  },
  requestActionSecondary: { backgroundColor: palette.surfaceMuted },
  requestActionText: { color: palette.white, fontSize: 11, fontWeight: "900" },
  requestActionTextSecondary: { color: palette.ink },
});
