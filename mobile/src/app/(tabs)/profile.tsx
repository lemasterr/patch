import { useQuery } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { AchievementArt } from "@/components/achievement-art";
import { ActionSheet } from "@/components/action-sheet";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { HeaderIcon, PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { SlidingTabs } from "@/components/sliding-tabs";
import { patchLayout, twoColumnPatchWidth } from "@/constants/patch-layout";
import { ProfileTravelMap } from "@/features/travel/profile-map";
import { palette, radius, spacing, type } from "@/constants/theme";
import { getOwnedAchievements } from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/providers/auth-provider";
export default function ProfileScreen() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<"achievements" | "map">("achievements");
  const { width } = useWindowDimensions();
  const tileWidth = twoColumnPatchWidth(width - spacing.md * 2);
  const achievementsQuery = useQuery({
    queryKey: queryKeys.collection.owned(session?.user.id ?? "anonymous"),
    queryFn: () => getOwnedAchievements(session!.user.id),
    enabled: Boolean(session),
  });
  const items = (achievementsQuery.data ?? []).filter(
    (item) =>
      item.status === "completed" &&
      item.lifecycle_status === "completed" &&
      item.hidden_at === null &&
      item.revoked_at === null &&
      item.moderation_status === "active",
  );

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([refreshProfile(), achievementsQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  const header = (
    <>
      <View style={styles.profileTop}>
        <View style={styles.summaryRow}>
          <Avatar size={64} avatarKey={profile?.avatar_key} />
          <View style={styles.stats}>
            <ProfileStat
              value={profile?.achievement_count ?? items.length}
              label="Patches"
            />
            <ProfileStat
              value={profile?.friend_count ?? 0}
              label="Friends"
              onPress={() => router.push("/friends" as Href)}
            />
            <ProfileStat
              value={profile?.total_received_likes ?? 0}
              label="Likes"
            />
          </View>
        </View>
        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.name}>
              {profile?.display_name ?? "Traveler"}
            </Text>
          </View>
          <Text style={styles.handle}>@{profile?.username ?? "patch"}</Text>
          {profile?.bio ? (
            <Text numberOfLines={2} style={styles.bio}>
              {profile.bio}
            </Text>
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
      {tab === "map" && session ? (
        <ProfileTravelMap ownProfile userId={session.user.id} />
      ) : null}
    </>
  );

  return (
    <Screen>
      <PatchHeader
        title="Profile"
        showLogo={false}
        showNotifications
        right={
          <HeaderIcon
            icon="dots-horizontal"
            label="Profile options"
            onPress={() => setMenuOpen(true)}
          />
        }
      />
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
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              icon="medal-outline"
              title="No Patches yet"
              body="Your finished Patches will live here."
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
        title={profile?.display_name ?? "Profile"}
        onClose={() => setMenuOpen(false)}
        items={[
          {
            icon: "account-edit-outline",
            label: "Edit profile",
            onPress: () => router.push("/profile-edit"),
          },
          {
            icon: "cog-outline",
            label: "Settings",
            onPress: () => router.push("/settings" as Href),
          },
          {
            icon: "logout",
            label: "Sign out",
            destructive: true,
            onPress: () => void signOut().then(() => router.replace("/auth")),
          },
        ]}
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
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: patchLayout.tabBarClearance,
    flexGrow: 1,
  },
  profileTop: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  identity: { minWidth: 0, flex: 1, gap: 3 },
  nameRow: { minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  name: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  handle: { color: palette.blue, fontSize: 13, fontWeight: "700" },
  bio: { marginTop: 2, color: palette.inkMuted, fontSize: 12, lineHeight: 17 },
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
    gap: 6,
  },
  tileArt: { borderRadius: radius.md },
  tileTitle: {
    width: "96%",
    minHeight: 31,
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
});
