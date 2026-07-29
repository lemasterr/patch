import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Avatar } from "@/components/avatar";
import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { SlidingTabs } from "@/components/sliding-tabs";
import { palette, radius, spacing, type } from "@/constants/theme";
import {
  getFriends,
  searchProfiles,
  updateFriendship,
  type FriendProfile,
} from "@/lib/queries";
import { invalidateForMutation, queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/providers/auth-provider";

export default function FriendsScreen() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<"friends" | "requests">("friends");
  const [search, setSearch] = useState("");
  const client = useQueryClient();
  const normalizedSearch = search.trim();
  const userId = profile?.id ?? "anonymous";
  const query = useQuery({
    queryKey: normalizedSearch
      ? queryKeys.social.search(userId, normalizedSearch)
      : tab === "friends"
        ? queryKeys.social.friends(userId)
        : queryKeys.social.requests(userId),
    queryFn: () =>
      normalizedSearch ? searchProfiles(normalizedSearch) : getFriends(tab),
    enabled: Boolean(profile),
  });
  async function act(
    person: FriendProfile,
    action: "request" | "accept" | "decline" | "cancel" | "remove",
  ) {
    const { error } = await updateFriendship(person.id, action);
    if (!error) void invalidateForMutation(client, "friend");
  }
  return (
    <Screen>
      <PatchHeader back title="Friends" showLogo={false} />
      <FlatList
        data={query.data ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={palette.blue}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <SlidingTabs
              value={tab}
              options={[
                { value: "friends", label: "Friends" },
                { value: "requests", label: "Requests" },
              ]}
              onChange={setTab}
            />
            <Pressable
              onPress={() =>
                router.push("/(tabs)/discover?feed=friends" as Href)
              }
              style={styles.searchAction}
            >
              <Text style={styles.searchText}>See friends in Discover</Text>
            </Pressable>
            <View style={styles.searchBox}>
              <TextInput
                accessibilityLabel="Search travelers"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setSearch}
                placeholder="Search travelers"
                placeholderTextColor={palette.inkMuted}
                value={search}
                style={styles.searchInput}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          query.isPending ? (
            <ActivityIndicator color={palette.blue} style={styles.loader} />
          ) : query.isError ? (
            <View style={styles.empty}>
              <Text style={styles.title}>Could not load travelers</Text>
              <Text style={styles.body}>
                Check your connection and try again.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void query.refetch()}
                style={styles.retry}
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.title}>
                {normalizedSearch
                  ? "No travelers found"
                  : tab === "friends"
                    ? "No friends yet"
                    : "No requests"}
              </Text>
              <Text style={styles.body}>
                {normalizedSearch
                  ? "Try a name or username."
                  : tab === "friends"
                    ? "Find Patch travelers in Discover and send a friend request."
                    : "Incoming and outgoing requests appear here."}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable
              onPress={() => router.push(`/user/${item.id}`)}
              style={styles.person}
            >
              <Avatar size={42} avatarKey={item.avatarKey} />
              <View style={styles.copy}>
                <Text style={styles.name}>{item.displayName}</Text>
                <Text style={styles.handle}>@{item.username}</Text>
              </View>
            </Pressable>
            {item.relationship === "incoming" ? (
              <View style={styles.buttons}>
                <Pressable
                  onPress={() => void act(item, "accept")}
                  style={styles.accept}
                >
                  <Text style={styles.acceptText}>Accept</Text>
                </Pressable>
                <Pressable
                  onPress={() => void act(item, "decline")}
                  style={styles.secondary}
                >
                  <Text style={styles.secondaryText}>Decline</Text>
                </Pressable>
              </View>
            ) : item.relationship === "outgoing" ? (
              <Pressable
                onPress={() => void act(item, "cancel")}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
            ) : item.relationship === "none" ? (
              <Pressable
                onPress={() => void act(item, "request")}
                style={styles.accept}
              >
                <Text style={styles.acceptText}>Add friend</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => void act(item, "remove")}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>Remove</Text>
              </Pressable>
            )}
          </View>
        )}
        contentContainerStyle={styles.content}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  searchAction: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
  },
  searchBox: {
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  searchInput: { color: palette.ink, flex: 1, fontSize: 14, minHeight: 44 },
  searchText: { color: palette.blue, fontWeight: "800" },
  loader: { marginTop: spacing.xl },
  empty: {
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  title: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 23,
    fontWeight: "900",
    textAlign: "center",
  },
  body: {
    maxWidth: 310,
    color: palette.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  retry: {
    backgroundColor: palette.blue,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  retryText: { color: palette.white, fontSize: 13, fontWeight: "900" },
  row: {
    alignItems: "center",
    borderBottomColor: palette.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 64,
    paddingVertical: spacing.xs,
  },
  person: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minWidth: 0,
  },
  copy: { flex: 1, minWidth: 0 },
  name: { color: palette.ink, fontSize: 14, fontWeight: "900" },
  handle: { color: palette.inkMuted, fontSize: 11, marginTop: 2 },
  buttons: { flexDirection: "row", gap: spacing.xs },
  accept: {
    alignItems: "center",
    backgroundColor: palette.blue,
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: spacing.sm,
  },
  acceptText: { color: palette.white, fontSize: 12, fontWeight: "900" },
  secondary: {
    alignItems: "center",
    borderColor: palette.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: spacing.sm,
  },
  secondaryText: { color: palette.ink, fontSize: 12, fontWeight: "800" },
});
