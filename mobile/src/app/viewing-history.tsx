import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AchievementArt } from "@/components/achievement-art";
import { EmptyState } from "@/components/empty-state";
import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { radius, spacing } from "@/constants/theme";
import { groupViewingHistory } from "@/features/discover/viewing-history-grouping";
import { getRecommendationViewHistory } from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";

export default function ViewingHistoryScreen() {
  const { profile, session } = useAuth();
  const { colors } = useTheme();
  const viewerId = session?.user.id ?? "anonymous";
  const timeZone =
    profile?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const history = useInfiniteQuery({
    queryKey: queryKeys.discover.history(viewerId),
    initialPageParam: null as Parameters<
      typeof getRecommendationViewHistory
    >[0],
    queryFn: ({ pageParam }) => getRecommendationViewHistory(pageParam),
    getNextPageParam: (page) => page.nextCursor,
    enabled: Boolean(session),
  });
  const pages = history.data?.pages;
  const sections = useMemo(
    () =>
      groupViewingHistory(pages?.flatMap((page) => page.items) ?? [], timeZone),
    [pages, timeZone],
  );

  if (history.isPending && !history.data) {
    return (
      <Screen>
        <PatchHeader back title="Viewing history" showNotifications={false} />
        <ActivityIndicator
          color={colors.blue}
          size="large"
          style={styles.loader}
        />
      </Screen>
    );
  }
  if (history.isError) {
    return (
      <Screen>
        <PatchHeader back title="Viewing history" showNotifications={false} />
        <View style={styles.state}>
          <Text style={[styles.stateText, { color: colors.inkMuted }]}>
            Could not load viewing history.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void history.refetch()}
            style={[styles.retry, { backgroundColor: colors.blue }]}
          >
            <Text style={[styles.retryText, { color: colors.white }]}>
              Try again
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <PatchHeader back title="Viewing history" showNotifications={false} />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.eventId}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={history.isRefetching}
            onRefresh={() => void history.refetch()}
            tintColor={colors.blue}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="history"
            title="No viewing history yet"
            body="Patches appear here after you see them in Discover."
          />
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionTitle, { color: colors.inkMuted }]}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.achievement.title}`}
            onPress={() => router.push(`/achievement/${item.achievement.id}`)}
            style={({ pressed }) => [
              styles.row,
              { borderColor: colors.border },
              pressed && styles.pressed,
            ]}
          >
            <AchievementArt achievement={item.achievement} style={styles.art} />
            <View style={styles.copy}>
              <Text
                numberOfLines={2}
                style={[styles.title, { color: colors.ink }]}
              >
                {item.achievement.title}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.author, { color: colors.inkMuted }]}
              >
                {item.achievement.owner.display_name}
              </Text>
            </View>
            <Text style={[styles.time, { color: colors.inkMuted }]}>
              {new Intl.DateTimeFormat(undefined, {
                hour: "numeric",
                minute: "2-digit",
                timeZone,
              }).format(new Date(item.viewedAt))}
            </Text>
          </Pressable>
        )}
        ListFooterComponent={
          history.isFetchingNextPage ? (
            <ActivityIndicator
              color={colors.blue}
              style={styles.footerSpinner}
            />
          ) : null
        }
        onEndReachedThreshold={0.45}
        onEndReached={() => {
          if (history.hasNextPage && !history.isFetchingNextPage)
            void history.fetchNextPage();
        }}
        stickySectionHeadersEnabled={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: "45%" },
  state: { alignItems: "center", gap: spacing.sm, padding: spacing.lg },
  stateText: { fontSize: 14 },
  retry: {
    borderRadius: radius.pill,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  retryText: { fontSize: 13, fontWeight: "900" },
  content: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    paddingBottom: spacing.xs,
    paddingTop: spacing.lg,
  },
  row: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 76,
  },
  art: { height: 52, width: 72 },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: "800", lineHeight: 19 },
  author: { fontSize: 12, marginTop: 3 },
  time: { fontSize: 12 },
  footerSpinner: { marginVertical: spacing.lg },
  pressed: { opacity: 0.65 },
});
