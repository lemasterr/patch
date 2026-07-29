import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { AchievementArt } from "@/components/achievement-art";
import { EmptyState } from "@/components/empty-state";
import { patchLayout, twoColumnPatchWidth } from "@/constants/patch-layout";
import {
  categoryLabels,
  palette,
  radius,
  spacing,
  type,
} from "@/constants/theme";
import type { Achievement } from "@/types/domain";

export type PatchCollectionMode = "list" | "grid";

type PatchCollectionViewProps = {
  items: readonly Achievement[];
  mode: PatchCollectionMode;
  onChangeMode?: (mode: PatchCollectionMode) => void;
  onOpen: (item: Achievement) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  header?: React.ReactElement | null;
  emptyTitle: string;
  emptyBody: string;
  pendingIds?: ReadonlySet<string>;
  contentBottomPadding?: number;
};

export function PatchCollectionView({
  items,
  mode,
  onChangeMode,
  onOpen,
  refreshing = false,
  onRefresh,
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
  header,
  emptyTitle,
  emptyBody,
  pendingIds,
  contentBottomPadding = patchLayout.tabBarClearance,
}: PatchCollectionViewProps) {
  const { width } = useWindowDimensions();
  const tileWidth = twoColumnPatchWidth(width - spacing.md * 2);
  return (
    <FlatList
      key={mode}
      data={items as Achievement[]}
      numColumns={mode === "grid" ? 2 : 1}
      keyExtractor={(item) => item.id}
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      windowSize={7}
      removeClippedSubviews
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[
        styles.content,
        { paddingBottom: contentBottomPadding },
      ]}
      columnWrapperStyle={
        mode === "grid" && items.length ? styles.gridRow : undefined
      }
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.blue}
          />
        ) : undefined
      }
      ListHeaderComponent={header}
      onEndReached={hasMore ? onLoadMore : undefined}
      onEndReachedThreshold={0.55}
      ListEmptyComponent={
        loading ? null : (
          <EmptyState
            icon="image-multiple-outline"
            title={emptyTitle}
            body={emptyBody}
          />
        )
      }
      renderItem={({ item }) => (
        <PatchTile
          item={item}
          mode={mode}
          width={tileWidth}
          pending={pendingIds?.has(item.id) ?? false}
          onOpen={onOpen}
        />
      )}
      ListFooterComponent={
        loadingMore || onChangeMode ? (
          <View style={styles.footer}>
            {loadingMore ? (
              <ActivityIndicator color={palette.blue} size="small" />
            ) : null}
            {onChangeMode ? (
              <View style={styles.viewToggle} accessibilityRole="tablist">
                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel="Show Patches as a list"
                  accessibilityState={{ selected: mode === "list" }}
                  onPress={() => onChangeMode("list")}
                  style={[
                    styles.viewButton,
                    mode === "list" && styles.viewButtonActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="view-list-outline"
                    color={mode === "list" ? palette.ink : palette.inkMuted}
                    size={19}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel="Show Patches as a grid"
                  accessibilityState={{ selected: mode === "grid" }}
                  onPress={() => onChangeMode("grid")}
                  style={[
                    styles.viewButton,
                    mode === "grid" && styles.viewButtonActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="view-grid-outline"
                    color={mode === "grid" ? palette.ink : palette.inkMuted}
                    size={18}
                  />
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null
      }
    />
  );
}

function PatchTile({
  item,
  mode,
  width,
  pending,
  onOpen,
}: {
  item: Achievement;
  mode: PatchCollectionMode;
  width: number;
  pending: boolean;
  onOpen: (item: Achievement) => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${item.title}, ${categoryLabels[item.category]}`}
      onPress={() => onOpen(item)}
      style={({ pressed }) => [
        styles.tile,
        mode === "grid" ? { width } : styles.listTile,
        pressed && styles.pressed,
      ]}
    >
      <AchievementArt
        achievement={item}
        style={[styles.art, mode === "grid" ? { width } : styles.listArt]}
      />
      <View style={mode === "grid" ? styles.gridCopy : styles.listCopy}>
        <Text
          numberOfLines={mode === "grid" ? 2 : 1}
          style={[styles.title, mode === "list" && styles.listTitle]}
        >
          {item.title}
        </Text>
        {mode === "list" ? (
          <Text numberOfLines={1} style={styles.meta}>
            {categoryLabels[item.category]}
          </Text>
        ) : null}
      </View>
      {pending ? (
        <View style={styles.pending}>
          <Text style={styles.pendingText}>Pending sync</Text>
        </View>
      ) : null}
      {mode === "list" ? (
        <MaterialCommunityIcons
          name="chevron-right"
          color={palette.inkMuted}
          size={20}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  gridRow: { gap: spacing.sm },
  tile: { marginBottom: spacing.xs },
  listTile: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 72,
    padding: spacing.xs,
    width: "100%",
  },
  art: { borderRadius: radius.md },
  listArt: {
    height: patchLayout.thumbnailHeight,
    width: patchLayout.thumbnailWidth,
  },
  gridCopy: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
    paddingTop: 6,
  },
  listCopy: { flex: 1, gap: 2, justifyContent: "center", minWidth: 0 },
  title: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    minHeight: 0,
    textAlign: "center",
  },
  listTitle: {
    fontSize: 14,
    lineHeight: 18,
    minHeight: 0,
    textAlign: "left",
  },
  meta: {
    color: palette.inkMuted,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  pending: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(244,185,78,0.16)",
    borderRadius: radius.pill,
    marginTop: spacing.xs,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  pendingText: { color: palette.gold, fontSize: 9, fontWeight: "800" },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  footer: { alignItems: "center", minHeight: 40, paddingVertical: spacing.sm },
  viewToggle: {
    alignSelf: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    flexDirection: "row",
    marginTop: spacing.sm,
    padding: 3,
  },
  viewButton: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 40,
    justifyContent: "center",
    width: 42,
  },
  viewButtonActive: { backgroundColor: "rgba(117,172,233,0.24)" },
});
