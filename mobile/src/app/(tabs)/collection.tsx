import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { CategoryPickerSheet } from "@/components/category-picker-sheet";
import { PageRefreshIndicator } from "@/components/page-refresh-indicator";
import {
  PatchCollectionView,
  type PatchCollectionMode,
} from "@/components/patch-collection-view";
import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { categoryLabels, palette, radius, spacing } from "@/constants/theme";
import { usePageRefresh } from "@/hooks/use-page-refresh";
import { queryKeys } from "@/lib/query-keys";
import { getCollectionPage, type CollectionCursor } from "@/lib/queries";
import { useAuth } from "@/providers/auth-provider";
import type { AchievementCategory } from "@/types/domain";

const categories = Object.keys(categoryLabels) as AchievementCategory[];

export default function CollectionScreen() {
  const { session } = useAuth();
  const { category: routeCategory, hidden } = useLocalSearchParams<{
    category?: string;
    hidden?: string;
  }>();
  const includeHidden = hidden === "1";
  const [category, setCategory] = useState<AchievementCategory | "all">("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInstance, setSearchInstance] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [mode, setMode] = useState<PatchCollectionMode>("list");
  const collectionQuery = useInfiniteQuery({
    queryKey: queryKeys.collection.list({
      ownerId: session?.user.id ?? "anonymous",
      lifecycle: "completed",
      category,
      query: debouncedSearch,
      sort: "newest",
      includeHidden,
      hiddenOnly: includeHidden,
    }),
    initialPageParam: null as CollectionCursor | null,
    queryFn: ({ pageParam }) =>
      getCollectionPage(
        {
          lifecycle: "completed",
          category,
          query: debouncedSearch,
          sort: "newest",
          includeHidden,
          hiddenOnly: includeHidden,
        },
        pageParam,
      ),
    getNextPageParam: (page) => page.nextCursor,
    enabled: Boolean(session),
  });
  const { isRefreshing, refreshProgress, onRefresh } = usePageRefresh({
    targets: [() => collectionQuery.refetch()],
  });

  useEffect(() => {
    if (!routeCategory) return;
    const timer = setTimeout(() => {
      setCategory(
        categories.includes(routeCategory as AchievementCategory)
          ? (routeCategory as AchievementCategory)
          : "all",
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [routeCategory]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 280);
    return () => clearTimeout(timer);
  }, [search]);

  function toggleSearch(next: boolean) {
    // LayoutAnimation gives the field its own short transition instead of
    // abruptly replacing the whole toolbar. Re-mounting the input fixes an
    // Android focus edge case after the close control is used.
    if (Platform.OS === "android") {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } else {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    if (next) setSearchInstance((value) => value + 1);
    setSearchOpen(next);
  }

  const header = (
    <View style={styles.header}>
      <PageRefreshIndicator progress={refreshProgress} />
      <View style={styles.controls}>
        {searchOpen ? (
          <View style={styles.searchField}>
            <MaterialCommunityIcons
              name="magnify"
              color={palette.inkMuted}
              size={20}
            />
            <TextInput
              key={searchInstance}
              autoFocus
              value={search}
              onChangeText={setSearch}
              accessibilityLabel="Search your Patches"
              placeholder="Search Patches"
              placeholderTextColor={palette.inkMuted}
              returnKeyType="search"
              style={styles.searchInput}
            />
            <Pressable
              accessibilityLabel="Close search"
              onPress={() => {
                setSearch("");
                toggleSearch(false);
              }}
              style={styles.iconControl}
            >
              <MaterialCommunityIcons
                name="close"
                color={palette.inkMuted}
                size={20}
              />
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityLabel="Search your Patches"
            onPress={() => toggleSearch(true)}
            style={styles.iconControl}
          >
            <MaterialCommunityIcons
              name="magnify"
              color={palette.ink}
              size={22}
            />
          </Pressable>
        )}
        {!searchOpen ? (
          <Pressable
            accessibilityLabel="Filter Patch category"
            accessibilityHint="Opens all Patch categories."
            onPress={() => setCategoryPickerOpen(true)}
            style={[
              styles.filterButton,
              category !== "all" && styles.filterButtonActive,
            ]}
          >
            <MaterialCommunityIcons
              name="tune-variant"
              color={category === "all" ? palette.ink : palette.white}
              size={19}
            />
            <Text
              style={[
                styles.filterText,
                category !== "all" && styles.filterTextActive,
              ]}
            >
              {category === "all" ? "Filter" : categoryLabels[category]}
            </Text>
          </Pressable>
        ) : null}
        <View accessibilityRole="tablist" style={styles.modeToggle}>
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="List view"
            accessibilityState={{ selected: mode === "list" }}
            onPress={() => setMode("list")}
            style={[
              styles.modeButton,
              mode === "list" && styles.modeButtonActive,
            ]}
          >
            <MaterialCommunityIcons
              name="view-list-outline"
              size={19}
              color={mode === "list" ? palette.ink : palette.inkMuted}
            />
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Grid view"
            accessibilityState={{ selected: mode === "grid" }}
            onPress={() => setMode("grid")}
            style={[
              styles.modeButton,
              mode === "grid" && styles.modeButtonActive,
            ]}
          >
            <MaterialCommunityIcons
              name="view-grid-outline"
              size={19}
              color={mode === "grid" ? palette.ink : palette.inkMuted}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <Screen>
      <PatchHeader
        title={includeHidden ? "Hidden Patches" : "My Patches"}
        showNotifications={false}
      />
      {collectionQuery.isPending && !collectionQuery.data ? (
        <ActivityIndicator
          color={palette.blue}
          size="large"
          style={styles.loader}
        />
      ) : collectionQuery.isError ? (
        <View style={styles.errorState}>
          <Text style={styles.errorText}>Could not load your Patches.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void collectionQuery.refetch()}
            style={styles.retry}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <PatchCollectionView
          items={
            collectionQuery.data?.pages.flatMap((page) => page.items) ?? []
          }
          mode={mode}
          onOpen={(item) => router.push(`/achievement/${item.id}`)}
          refreshing={isRefreshing}
          onRefresh={() => void onRefresh()}
          loadingMore={collectionQuery.isFetchingNextPage}
          hasMore={Boolean(collectionQuery.hasNextPage)}
          onLoadMore={() => {
            if (
              collectionQuery.hasNextPage &&
              !collectionQuery.isFetchingNextPage
            )
              void collectionQuery.fetchNextPage();
          }}
          header={header}
          emptyTitle={
            search || category !== "all" ? "Nothing matches" : "No Patches yet"
          }
          emptyBody={
            search || category !== "all"
              ? "Try a different search or category."
              : "Create your first Patch to start this collection."
          }
        />
      )}
      <CategoryPickerSheet
        includeAll
        title="Filter by category"
        visible={categoryPickerOpen}
        value={category}
        onClose={() => setCategoryPickerOpen(false)}
        onSelect={(value) => setCategory(value)}
      />
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
  header: { gap: spacing.xs, paddingBottom: spacing.sm },
  controls: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  iconControl: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  searchField: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
    height: 44,
    paddingLeft: spacing.sm,
  },
  searchInput: { color: palette.ink, flex: 1, fontSize: 14, height: 44 },
  filterButton: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    height: 44,
    justifyContent: "center",
    minWidth: 96,
    paddingHorizontal: spacing.sm,
  },
  filterButtonActive: { backgroundColor: palette.blue },
  filterText: { color: palette.ink, fontSize: 12, fontWeight: "900" },
  filterTextActive: { color: palette.white },
  modeToggle: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    flexDirection: "row",
    padding: 3,
  },
  modeButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  modeButtonActive: { backgroundColor: palette.surface },
});
