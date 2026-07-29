import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ActionSheet, type ActionSheetItem } from "@/components/action-sheet";
import { AchievementArt } from "@/components/achievement-art";
import { Avatar } from "@/components/avatar";
import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { PATCH_ASPECT_RATIO } from "@/constants/patch-layout";
import {
  categoryLabels,
  palette,
  radius,
  shadow,
  spacing,
  type,
} from "@/constants/theme";
import { usePageRefresh } from "@/hooks/use-page-refresh";
import { getAchievement } from "@/lib/queries";
import {
  invalidateQueryRoots,
  queryInvalidation,
  queryKeys,
} from "@/lib/query-keys";
import { trackProductEvent } from "@/lib/product-analytics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import type { Database } from "@/types/database";

function operationId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    },
  );
}

export default function AchievementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const queryClient = useQueryClient();
  const likedQueryKey = ["patch", "liked", id, session?.user.id] as const;
  const patchQuery = useQuery({
    queryKey: queryKeys.patch.detail(id),
    queryFn: () => getAchievement(id),
    enabled: Boolean(id),
  });
  const likedQuery = useQuery({
    queryKey: likedQueryKey,
    queryFn: async () => {
      if (!session) return false;
      const { data, error } = await supabase
        .from("likes")
        .select("id")
        .eq("achievement_id", id)
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    enabled: Boolean(session && id),
  });
  const { isRefreshing, onRefresh } = usePageRefresh({
    targets: [() => patchQuery.refetch()],
  });
  const achievement = patchQuery.data ?? null;
  const own = achievement?.owner_id === session?.user.id;
  const liked = likedQuery.data ?? false;

  async function toggleLike() {
    if (!achievement || own) return;
    const previous = liked;
    const previousPatch = achievement;
    const next = !previous;
    queryClient.setQueryData(likedQueryKey, next);
    queryClient.setQueryData(queryKeys.patch.detail(id), {
      ...achievement,
      like_count: Math.max(0, achievement.like_count + (next ? 1 : -1)),
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await supabase.rpc("toggle_achievement_like", {
      p_achievement_id: achievement.id,
      p_liked: next,
    });
    if (error) {
      queryClient.setQueryData(likedQueryKey, previous);
      queryClient.setQueryData(queryKeys.patch.detail(id), previousPatch);
    } else {
      void trackProductEvent("reaction", achievement.id).catch(() => undefined);
    }
  }

  function confirmHide() {
    if (!achievement) return;
    Alert.alert(
      "Hide Patch?",
      "It will be removed from your normal collection and every public surface. You can restore it in Hidden Patches.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Hide",
          style: "destructive",
          onPress: () =>
            void supabase
              .rpc("set_patch_hidden", {
                p_patch_id: achievement.id,
                p_hidden: true,
                p_operation_id: operationId(),
              })
              .then(({ error }) => {
                if (!error) router.replace("/(tabs)/collection");
              }),
        },
      ],
    );
  }

  function confirmBlock() {
    if (!achievement) return;
    Alert.alert(
      "Block this traveler?",
      "Their public Patches, likes, and friend connection will be removed from your view.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () =>
            void supabase
              .rpc("block_user", { p_user_id: achievement.owner_id })
              .then(({ error }) => {
                if (!error) {
                  void invalidateQueryRoots(
                    queryClient,
                    queryInvalidation.block,
                  );
                  router.back();
                }
              }),
        },
      ],
    );
  }

  async function report(reason: Database["public"]["Enums"]["report_reason"]) {
    if (!achievement) return;
    const { error } = await supabase.rpc("report_content", {
      p_reported_user_id: achievement.owner_id,
      p_achievement_id: achievement.id,
      p_reason: reason,
    });
    if (!error) {
      Alert.alert("Report sent", "Thank you. Our team will review it.");
    }
  }

  if (patchQuery.isPending)
    return (
      <Screen>
        <PatchHeader back title="Patch" showNotifications={false} />
        <ActivityIndicator
          size="large"
          color={palette.blue}
          style={styles.loader}
        />
      </Screen>
    );
  if (!achievement)
    return (
      <Screen>
        <PatchHeader back title="Not found" showNotifications={false} />
        <View style={styles.loader}>
          <Text style={styles.muted}>This Patch is no longer available.</Text>
        </View>
      </Screen>
    );

  const openProfile = () =>
    router.push(
      (own ? "/(tabs)/profile" : `/user/${achievement.owner_id}`) as Href,
    );
  const menuItems: ActionSheetItem[] = own
    ? [
        {
          icon: "pencil-outline",
          label: "Edit Patch",
          detail:
            achievement.source_kind === "user"
              ? "Update your Patch details"
              : "Personalise travel date and description",
          onPress: () => router.push(`/achievement-edit/${achievement.id}`),
        },
        {
          icon: "eye-off-outline",
          label: achievement.hidden_at ? "Restore Patch" : "Hide Patch",
          detail: achievement.hidden_at
            ? "Return it to your collection and eligible surfaces"
            : "Remove it from collection and public views",
          onPress: achievement.hidden_at
            ? () =>
                void supabase
                  .rpc("set_patch_hidden", {
                    p_patch_id: achievement.id,
                    p_hidden: false,
                    p_operation_id: operationId(),
                  })
                  .then(({ error }) => {
                    if (!error) void onRefresh();
                  })
            : confirmHide,
        },
        {
          icon: "share-variant-outline",
          label: "Share",
          onPress: () =>
            void Share.share({
              title: achievement.title,
              message: `${achievement.title}\npatch://achievement/${achievement.id}`,
            }).then(() =>
              trackProductEvent("share", achievement.id).catch(() => undefined),
            ),
        },
      ]
    : [
        {
          icon: "account-outline",
          label: "View profile",
          onPress: openProfile,
        },
        {
          icon: "share-variant-outline",
          label: "Share",
          onPress: () =>
            void Share.share({
              title: achievement.title,
              message: `${achievement.title}\npatch://achievement/${achievement.id}`,
            }).then(() =>
              trackProductEvent("share", achievement.id).catch(() => undefined),
            ),
        },
        {
          icon: "flag-outline",
          label: "Report Patch",
          detail: "Tell us what is wrong",
          onPress: () => setReportOpen(true),
        },
        {
          icon: "account-cancel-outline",
          label: "Block traveler",
          detail: "Hide each other’s public activity",
          destructive: true,
          onPress: confirmBlock,
        },
      ];

  return (
    <Screen>
      <PatchHeader back title="Patch" showNotifications={false} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void onRefresh()}
            tintColor={palette.blue}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={openProfile} style={styles.authorRow}>
          <Avatar size={38} avatarKey={achievement.owner?.avatar_key} />
          <View style={styles.authorCopy}>
            <Text numberOfLines={1} style={styles.authorName}>
              {achievement.owner?.display_name ?? "Patch traveler"}
            </Text>
            <Text numberOfLines={1} style={styles.handle}>
              @{achievement.owner?.username ?? "patch"}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Patch options"
            hitSlop={10}
            onPress={() => setMenuOpen(true)}
            style={styles.moreButton}
          >
            <MaterialCommunityIcons
              name="dots-horizontal"
              size={23}
              color={palette.ink}
            />
          </Pressable>
        </Pressable>
        <AchievementArt achievement={achievement} style={styles.hero} />
        <Text style={styles.title}>{achievement.title}</Text>
        <Text style={styles.description}>{achievement.description}</Text>
        <View style={styles.infoRow}>
          {!own ? (
            <Pressable
              accessibilityLabel={liked ? "Unlike Patch" : "Like Patch"}
              onPress={() => void toggleLike()}
              style={styles.like}
            >
              <MaterialCommunityIcons
                name={liked ? "heart" : "heart-outline"}
                size={18}
                color={liked ? palette.red : palette.red}
              />
              <Text style={[styles.likeCount, liked && styles.likeCountActive]}>
                {achievement.like_count}
              </Text>
            </Pressable>
          ) : (
            <View />
          )}
          <View style={styles.metaRow}>
            <Pressable
              onPress={() =>
                router.push(
                  `/(tabs)/collection?category=${achievement.category}` as Href,
                )
              }
              style={styles.metaInline}
            >
              <MaterialCommunityIcons
                name="shape-outline"
                size={14}
                color={palette.blue}
              />
              <Text style={styles.categoryLink}>
                {categoryLabels[achievement.category]}
              </Text>
            </Pressable>
            <View style={styles.metaDivider} />
            <Text style={styles.metaText}>{achievement.achievement_date}</Text>
          </View>
        </View>
      </ScrollView>
      <ActionSheet
        visible={menuOpen}
        title={achievement.title}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />
      <ActionSheet
        visible={reportOpen}
        title="Why are you reporting this Patch?"
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

const styles = StyleSheet.create({
  loader: { alignSelf: "center", marginTop: "48%" },
  muted: { color: palette.inkMuted },
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xxl },
  authorRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  authorCopy: { flex: 1 },
  authorName: { color: palette.ink, fontSize: 13, fontWeight: "800" },
  handle: { color: palette.inkMuted, fontSize: 10, marginTop: 1 },
  moreButton: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  hero: {
    aspectRatio: PATCH_ASPECT_RATIO,
    borderRadius: radius.xl,
    width: "100%",
    ...shadow,
  },
  title: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 24,
  },
  description: { color: palette.ink, fontSize: 14, lineHeight: 21 },
  infoRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    minHeight: 32,
  },
  metaInline: { alignItems: "center", flexDirection: "row", gap: 4 },
  categoryLink: { color: palette.blue, fontSize: 11, fontWeight: "900" },
  metaText: { color: palette.inkMuted, fontSize: 11, fontWeight: "700" },
  metaDivider: { backgroundColor: palette.border, height: 16, width: 1 },
  like: { alignItems: "center", flexDirection: "row", gap: 5, minHeight: 32 },
  likeCount: { color: palette.ink, fontSize: 12, fontWeight: "900" },
  likeCountActive: { color: palette.red },
});
