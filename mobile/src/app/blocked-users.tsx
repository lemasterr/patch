import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { palette, radius, spacing, type } from "@/constants/theme";
import { invalidateQueryRoots, queryInvalidation } from "@/lib/query-keys";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

export default function BlockedUsersScreen() {
  const { session } = useAuth();
  const client = useQueryClient();
  const blocks = useQuery({
    queryKey: ["social", "blocked", session?.user.id ?? "anonymous"],
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_blocked_users_v2");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function unblock(profileId: string) {
    const { error } = await supabase.rpc("unblock_user", {
      p_user_id: profileId,
    });
    if (!error) {
      await Promise.all([
        blocks.refetch(),
        invalidateQueryRoots(client, queryInvalidation.block),
      ]);
    }
  }

  return (
    <Screen>
      <PatchHeader back showLogo={false} title="Blocked travelers" />
      {blocks.isPending ? (
        <ActivityIndicator
          color={palette.blue}
          size="large"
          style={styles.loader}
        />
      ) : (
        <FlatList
          data={blocks.data ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={blocks.isRefetching}
              onRefresh={() => void blocks.refetch()}
              tintColor={palette.blue}
            />
          }
          contentContainerStyle={styles.content}
          ListEmptyComponent={
            <EmptyState
              icon="account-check-outline"
              title="No blocked travelers"
              body="People you block will appear here."
            />
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar size={42} avatarKey={item.avatar_key} />
              <View style={styles.copy}>
                <Text numberOfLines={1} style={styles.name}>
                  {item.display_name}
                </Text>
                <Text numberOfLines={1} style={styles.handle}>
                  @{item.username}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={`Unblock ${item.display_name}`}
                onPress={() => void unblock(item.id)}
                style={styles.unblock}
              >
                <Text style={styles.unblockText}>Unblock</Text>
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
  content: { flexGrow: 1, padding: spacing.md, paddingBottom: spacing.xxl },
  row: {
    alignItems: "center",
    borderBottomColor: palette.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 68,
  },
  copy: { flex: 1, minWidth: 0 },
  name: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 14,
    fontWeight: "900",
  },
  handle: { color: palette.inkMuted, fontSize: 11, marginTop: 2 },
  unblock: {
    alignItems: "center",
    borderColor: palette.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: spacing.sm,
  },
  unblockText: { color: palette.ink, fontSize: 12, fontWeight: "800" },
});
