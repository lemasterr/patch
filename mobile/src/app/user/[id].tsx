import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { AchievementArt } from "@/components/achievement-art";
import { ActionSheet, type ActionSheetItem } from "@/components/action-sheet";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { HeaderIcon, PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { SlidingTabs } from "@/components/sliding-tabs";
import { patchLayout, twoColumnPatchWidth } from "@/constants/patch-layout";
import { ProfileTravelMap } from "@/features/travel/profile-map";
import { palette, radius, spacing, type } from "@/constants/theme";
import {
  getFriendshipState,
  getPublicAchievements,
  getPublicProfile,
  updateFriendship,
} from "@/lib/queries";
import { invalidateForMutation, queryKeys } from "@/lib/query-keys";
import { trackProductEvent } from "@/lib/product-analytics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import { useFeatureFlags } from "@/providers/feature-flag-provider";
import type { Database } from "@/types/database";

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<"achievements" | "map">("achievements");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const { isEnabled } = useFeatureFlags();
  const socialEnabled = isEnabled("social_enabled");
  const viewerId = session?.user.id ?? "anonymous";
  const queryClient = useQueryClient();
  const tileWidth = twoColumnPatchWidth(width - spacing.md * 2);
  const profileQuery = useQuery({
    queryKey: queryKeys.profile.public(viewerId, id),
    queryFn: () => getPublicProfile(id),
    enabled: Boolean(id),
  });
  const achievementsQuery = useQuery({
    queryKey: queryKeys.patch.publicByOwner(viewerId, id),
    queryFn: () => getPublicAchievements(id),
    enabled: Boolean(id),
  });
  const friendshipQuery = useQuery({
    queryKey: queryKeys.social.relationship(viewerId, id),
    queryFn: () => getFriendshipState(id),
    enabled: Boolean(session && id && id !== session.user.id && socialEnabled),
  });
  const profile = profileQuery.data ?? null;
  const items = profile ? (achievementsQuery.data ?? []) : [];
  const loading = profileQuery.isPending || achievementsQuery.isPending;
  const error = profileQuery.error ?? achievementsQuery.error;

  async function changeFriendship(
    action: "request" | "accept" | "decline" | "cancel" | "remove",
  ) {
    const { error: actionError } = await updateFriendship(id, action);
    if (!actionError) {
      if (action === "request")
        void trackProductEvent("friend_request", id, "profile").catch(
          () => undefined,
        );
      await Promise.all([
        friendshipQuery.refetch(),
        invalidateForMutation(queryClient, "friend"),
      ]);
    }
  }

  function confirmBlock() {
    Alert.alert(
      "Block this traveler?",
      "Their profile, Patches, likes, and friend connection will be removed from your view.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () =>
            void supabase
              .rpc("block_user", { p_user_id: id })
              .then(({ error: blockError }) => {
                if (!blockError) {
                  void invalidateForMutation(queryClient, "block");
                  router.back();
                }
              }),
        },
      ],
    );
  }

  async function report(reason: Database["public"]["Enums"]["report_reason"]) {
    const { error: reportError } = await supabase.rpc("report_content", {
      p_reported_user_id: id,
      p_achievement_id: null as unknown as string,
      p_reason: reason,
    });
    if (!reportError)
      Alert.alert("Report sent", "Thank you. Our team will review it.");
  }

  if (loading) {
    return (
      <Screen>
        <PatchHeader back title="Profile" />
        <ActivityIndicator
          size="large"
          color={palette.blue}
          style={styles.loader}
        />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <PatchHeader back title="Profile" />
        <View style={styles.errorState}>
          <Text style={styles.errorTitle}>Could not load this profile</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void profileQuery.refetch();
              void achievementsQuery.refetch();
            }}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const header = profile ? (
    <>
      <View style={styles.profileTop}>
        <View style={styles.summaryRow}>
          <Avatar size={64} avatarKey={profile.avatar_key} />
          <View style={styles.stats}>
            <ProfileStat value={profile.achievement_count} label="Patches" />
            <ProfileStat
              value={profile.friend_count ?? 0}
              label="Friends"
              onPress={
                socialEnabled
                  ? () => router.push("/friends" as Href)
                  : undefined
              }
            />
            <ProfileStat value={profile.total_received_likes} label="Likes" />
          </View>
        </View>
        <View style={styles.identity}>
          <Text numberOfLines={1} style={styles.name}>
            {profile.display_name}
          </Text>
          <Text style={styles.handle}>@{profile.username}</Text>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
          {session && id !== session.user.id && socialEnabled ? (
            <View style={styles.actions}>
              <Pressable
                disabled={
                  friendshipQuery.isPending ||
                  friendshipQuery.data === "unavailable"
                }
                onPress={() => {
                  const state = friendshipQuery.data;
                  if (state === "incoming") void changeFriendship("accept");
                  else if (state === "outgoing")
                    void changeFriendship("cancel");
                  else if (state === "friends") void changeFriendship("remove");
                  else if (state !== "unavailable")
                    void changeFriendship("request");
                }}
                style={styles.friendButton}
              >
                <Text style={styles.friendButtonText}>
                  {friendshipQuery.data === "friends"
                    ? "Friends"
                    : friendshipQuery.data === "incoming"
                      ? "Accept request"
                      : friendshipQuery.data === "outgoing"
                        ? "Request sent"
                        : "Add friend"}
                </Text>
              </Pressable>
              <HeaderIcon
                icon="dots-horizontal"
                label="Profile safety options"
                onPress={() => setMenuOpen(true)}
              />
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.tabs}>
        <SlidingTabs
          value={tab}
          options={[
            { value: "achievements", label: "Patches" },
            { value: "map", label: "Map" },
          ]}
          onChange={setTab}
        />
      </View>
      {tab === "map" ? (
        <ProfileTravelMap
          userId={id}
          mapIsPublic={profile.map_is_public ?? false}
        />
      ) : null}
    </>
  ) : null;

  return (
    <Screen>
      <PatchHeader back title="Profile" showLogo={false} />
      {tab === "map" ? (
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
        >
          {header}
        </ScrollView>
      ) : (
        <FlatList
          data={items}
          numColumns={2}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="never"
          columnWrapperStyle={items.length ? styles.gridRow : undefined}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              icon="account-off-outline"
              title={profile ? "No public Patches" : "Profile unavailable"}
              body={
                profile
                  ? "This traveler has not shared anything yet."
                  : "This profile is private or no longer exists."
              }
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/achievement/${item.id}`)}
              style={({ pressed }) => [
                styles.tile,
                { width: tileWidth },
                pressed && styles.pressed,
              ]}
            >
              <AchievementArt
                achievement={item}
                style={[styles.tileArt, { width: tileWidth }]}
              />
              <Text numberOfLines={2} style={styles.tileTitle}>
                {item.title}
              </Text>
            </Pressable>
          )}
        />
      )}
      <ActionSheet
        visible={menuOpen}
        title="Profile options"
        onClose={() => setMenuOpen(false)}
        items={
          [
            {
              icon: "flag-outline",
              label: "Report profile",
              onPress: () => setReportOpen(true),
            },
            {
              icon: "account-cancel-outline",
              label: "Block traveler",
              destructive: true,
              onPress: confirmBlock,
            },
          ] satisfies ActionSheetItem[]
        }
      />
      <ActionSheet
        visible={reportOpen}
        title="Why are you reporting this profile?"
        onClose={() => setReportOpen(false)}
        items={[
          ["spam", "Spam or scam"],
          ["harassment", "Harassment"],
          ["hate", "Hate or hateful conduct"],
          ["sexual_content", "Sexual content"],
          ["self_harm", "Self-harm concern"],
          ["other", "Other"],
        ].map(([reason, label]) => ({
          icon: "flag-outline" as const,
          label,
          onPress: () =>
            void report(reason as Database["public"]["Enums"]["report_reason"]),
        }))}
      />
    </Screen>
  );
}

function ProfileStat({
  value,
  label,
  onPress,
}: {
  value: number;
  label: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={styles.stat}>
      {content}
    </Pressable>
  ) : (
    <View style={styles.stat}>{content}</View>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: "45%" },
  errorState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  errorTitle: { color: palette.ink, fontFamily: type.rounded, fontSize: 18 },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.blue,
  },
  retryText: { color: palette.white, fontWeight: "800" },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: patchLayout.tabBarClearance,
    flexGrow: 1,
  },
  profileTop: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  identity: { minWidth: 0, flex: 1, gap: 2 },
  name: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 23,
    fontWeight: "900",
  },
  handle: { color: palette.blue, fontSize: 13, fontWeight: "700" },
  bio: { marginTop: 4, color: palette.inkMuted, fontSize: 12, lineHeight: 17 },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  friendButton: {
    alignItems: "center",
    backgroundColor: palette.blue,
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  friendButtonText: { color: palette.white, fontSize: 13, fontWeight: "900" },
  stats: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  stat: {
    minWidth: 0,
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  statValue: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 17,
    fontWeight: "900",
  },
  statLabel: {
    color: palette.inkMuted,
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
  },
  tabs: { marginBottom: spacing.md },
  gridRow: { gap: spacing.md },
  tile: {
    marginBottom: spacing.md,
    alignItems: "center",
    gap: 5,
  },
  tileArt: { borderRadius: radius.md },
  tileTitle: {
    width: "96%",
    minHeight: 29,
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
});
