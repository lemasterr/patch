import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { FeatureUnavailable } from "@/components/feature-unavailable";
import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { palette, radius, spacing, type } from "@/constants/theme";
import {
  searchProfiles,
  updateFriendship,
  type FriendProfile,
} from "@/lib/queries";
import { invalidateForMutation, queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/providers/auth-provider";
import { useFeatureFlags } from "@/providers/feature-flag-provider";

export default function PeopleSearchScreen() {
  const { profile } = useAuth();
  const { isEnabled } = useFeatureFlags();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const userId = profile?.id ?? "anonymous";

  useEffect(() => {
    const timeout = setTimeout(() => setQuery(input.trim()), 160);
    return () => clearTimeout(timeout);
  }, [input]);

  const people = useQuery({
    queryKey: queryKeys.social.search(userId, query),
    queryFn: () => searchProfiles(query),
    enabled: Boolean(profile && query && isEnabled("social_enabled")),
  });

  if (!isEnabled("social_enabled")) {
    return (
      <Screen>
        <PatchHeader back showNotifications={false} title="Find travelers" />
        <FeatureUnavailable
          title="Finding travelers is temporarily paused"
          body="Please check back shortly."
        />
      </Screen>
    );
  }

  async function act(
    person: FriendProfile,
    action: "request" | "accept" | "decline" | "cancel" | "remove",
  ) {
    const { error } = await updateFriendship(person.id, action);
    if (!error) {
      void invalidateForMutation(queryClient, "friend");
      void people.refetch();
    }
  }

  return (
    <Screen>
      <PatchHeader back showNotifications={false} title="Find travelers" />
      <FlatList
        data={people.data ?? []}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.searchBox}>
            <MaterialCommunityIcons
              name="magnify"
              color={palette.inkMuted}
              size={21}
            />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              accessibilityLabel="Search travelers"
              onChangeText={setInput}
              placeholder="Name or @username"
              placeholderTextColor={palette.inkMuted}
              returnKeyType="search"
              value={input}
              style={styles.input}
            />
            {input ? (
              <Pressable
                accessibilityLabel="Clear search"
                onPress={() => setInput("")}
              >
                <MaterialCommunityIcons
                  name="close-circle"
                  color={palette.inkMuted}
                  size={19}
                />
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !query ? (
            <EmptyState
              icon="account-search-outline"
              title="Start with a few letters"
              body="Results appear as you type a name or username."
            />
          ) : people.isPending ? (
            <ActivityIndicator color={palette.blue} style={styles.loader} />
          ) : people.isError ? (
            <View style={styles.errorState}>
              <Text style={styles.errorText}>Could not search travelers.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void people.refetch()}
                style={styles.retry}
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <EmptyState
              icon="account-off-outline"
              title="No travelers found"
              body="Try the first letters of a name or username."
            />
          )
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable
              onPress={() => router.push(`/user/${item.id}`)}
              style={styles.person}
            >
              <Avatar size={46} avatarKey={item.avatarKey} />
              <View style={styles.copy}>
                <Text numberOfLines={1} style={styles.name}>
                  {item.displayName}
                </Text>
                <Text numberOfLines={1} style={styles.handle}>
                  @{item.username}
                </Text>
                {item.bio ? (
                  <Text numberOfLines={1} style={styles.bio}>
                    {item.bio}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            <FriendAction
              person={item}
              onAction={(action) => void act(item, action)}
            />
          </View>
        )}
      />
    </Screen>
  );
}

function FriendAction({
  person,
  onAction,
}: {
  person: FriendProfile;
  onAction: (
    action: "request" | "accept" | "decline" | "cancel" | "remove",
  ) => void;
}) {
  if (person.relationship === "incoming") {
    return (
      <View style={styles.actionPair}>
        <Action label="Accept" onPress={() => onAction("accept")} />
        <Action label="Decline" secondary onPress={() => onAction("decline")} />
      </View>
    );
  }
  if (person.relationship === "outgoing")
    return (
      <Action label="Requested" secondary onPress={() => onAction("cancel")} />
    );
  if (person.relationship === "friends")
    return (
      <Action label="Friends" secondary onPress={() => onAction("remove")} />
    );
  return <Action label="Add" onPress={() => onAction("request")} />;
}

function Action({
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
      style={[styles.action, secondary && styles.actionSecondary]}
    >
      <Text
        style={[styles.actionText, secondary && styles.actionTextSecondary]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  searchBox: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 50,
    paddingHorizontal: spacing.sm,
  },
  input: { color: palette.ink, flex: 1, fontSize: 15, minHeight: 50 },
  loader: { marginTop: spacing.xl },
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
  row: {
    alignItems: "center",
    borderBottomColor: palette.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 72,
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
  name: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 14,
    fontWeight: "900",
  },
  handle: { color: palette.inkMuted, fontSize: 11, marginTop: 1 },
  bio: { color: palette.inkMuted, fontSize: 11, marginTop: 3 },
  actionPair: { flexDirection: "row", gap: 5 },
  action: {
    alignItems: "center",
    backgroundColor: palette.blue,
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: spacing.sm,
  },
  actionSecondary: { backgroundColor: palette.surfaceMuted },
  actionText: { color: palette.white, fontSize: 11, fontWeight: "900" },
  actionTextSecondary: { color: palette.ink, fontSize: 10 },
});
