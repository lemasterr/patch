import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AchievementArt } from "@/components/achievement-art";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { FeatureUnavailable } from "@/components/feature-unavailable";
import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { palette, radius, spacing, type } from "@/constants/theme";
import { getFriendFeed } from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/providers/auth-provider";
import { useFeatureFlags } from "@/providers/feature-flag-provider";

export default function FriendsFeedScreen() {
  const { session } = useAuth();
  const { isEnabled } = useFeatureFlags();
  const feed = useQuery({
    queryKey: queryKeys.social.feed(session?.user.id ?? "anonymous"),
    queryFn: () => getFriendFeed(),
    enabled: Boolean(session && isEnabled("social_enabled")),
  });

  if (!isEnabled("social_enabled")) {
    return (
      <Screen>
        <PatchHeader back showLogo={false} title="Friends feed" />
        <FeatureUnavailable
          title="Friends feed is temporarily paused"
          body="Please check back shortly."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <PatchHeader back showLogo={false} title="Friends feed" />
      {feed.isPending ? (
        <ActivityIndicator
          color={palette.blue}
          size="large"
          style={styles.loader}
        />
      ) : feed.isError ? (
        <View style={styles.errorState}>
          <Text style={styles.errorText}>
            Could not load your friends’ feed.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void feed.refetch()}
            style={styles.retry}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={feed.data ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={feed.isRefetching}
              onRefresh={() => void feed.refetch()}
              tintColor={palette.blue}
            />
          }
          contentContainerStyle={styles.content}
          ListEmptyComponent={
            <EmptyState
              icon="account-group-outline"
              title="Your friends’ Patches will appear here"
              body="Add friends to see their public completed Patches in one place."
            />
          }
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Pressable
                onPress={() => router.push(`/user/${item.owner_id}`)}
                style={styles.author}
              >
                <Avatar size={30} avatarKey={item.owner?.avatar_key} />
                <Text numberOfLines={1} style={styles.authorName}>
                  {item.owner?.display_name ?? "Patch traveler"}
                </Text>
              </Pressable>
              <Pressable onPress={() => router.push(`/achievement/${item.id}`)}>
                <AchievementArt achievement={item} style={styles.art} />
                <Text numberOfLines={2} style={styles.title}>
                  {item.title}
                </Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: "45%" },
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
  content: {
    flexGrow: 1,
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  item: { gap: spacing.xs },
  author: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 40,
  },
  authorName: { color: palette.ink, flex: 1, fontSize: 13, fontWeight: "800" },
  art: { aspectRatio: 16 / 10, borderRadius: radius.md, width: "100%" },
  title: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19,
  },
});
