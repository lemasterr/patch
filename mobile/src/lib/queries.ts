import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type {
  Achievement,
  AchievementEvent,
  OwnedAchievement,
  PatchNotification,
  Profile,
} from "@/types/domain";

const achievementSelect = `
  id, owner_id, title, description, category, rarity, status, lifecycle_status,
  target_date, hidden_at, source_kind, source_key, revoked_at, moderation_status, visibility,
  achievement_date,
  cover_key, cover_url, like_count, created_at, completed_at, reveal_viewed_at,
  owner:profiles!achievements_owner_id_fkey(
    id, username, display_name, bio, avatar_key, onboarding_completed, achievement_count, total_received_likes, friend_count
  )
`;

const ownedAchievementSelect = `
  ${achievementSelect},
  collection_viewed_at
`;

export async function getOwnedAchievements(ownerId: string) {
  const { data, error } = await supabase
    .from("achievements")
    .select(ownedAchievementSelect)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as OwnedAchievement[];
}

type CollectionRow =
  Database["public"]["Functions"]["get_collection_v2"]["Returns"][number];

export type CollectionCursor = {
  createdAt: string;
  id: string;
  title: string;
  rarity: Achievement["rarity"];
};

export type CollectionPage = {
  items: OwnedAchievement[];
  nextCursor: CollectionCursor | null;
  hasMore: boolean;
};

export type CollectionInput = {
  lifecycle?: "locked" | "in_progress" | "completed";
  category?: Achievement["category"] | "all";
  query?: string;
  sort?: "newest" | "title" | "rarity";
  includeHidden?: boolean;
  hiddenOnly?: boolean;
};

function toCollectionAchievement(row: CollectionRow): OwnedAchievement {
  return {
    ...row,
    rarity: row.rarity,
    target_date: row.target_date ?? null,
    hidden_at: row.hidden_at ?? null,
    source_key: row.source_key ?? null,
    revoked_at: row.revoked_at ?? null,
    cover_key: row.cover_key ?? null,
    cover_url: row.cover_url ?? null,
    completed_at: row.completed_at ?? null,
    reveal_viewed_at: row.reveal_viewed_at ?? null,
    collection_viewed_at: row.collection_viewed_at ?? null,
  } as OwnedAchievement;
}

export async function getCollectionPage(
  input: CollectionInput,
  cursor?: CollectionCursor | null,
  pageSize = 20,
): Promise<CollectionPage> {
  const args = {
    p_lifecycle: input.lifecycle,
    p_category:
      input.category && input.category !== "all" ? input.category : undefined,
    p_query: input.query?.trim() || undefined,
    p_sort: input.sort ?? "newest",
    p_include_hidden: input.includeHidden ?? false,
    p_hidden_only: input.hiddenOnly ?? false,
    p_limit: pageSize + 1,
    p_before_created_at: cursor?.createdAt,
    p_before_id: cursor?.id,
    p_before_title: cursor?.title,
    p_before_rarity_rank:
      cursor?.rarity === "legendary" ? 3 : cursor?.rarity === "rare" ? 2 : 1,
  };
  const { data, error } = await supabase.rpc(
    "get_collection_v3" as never,
    args as never,
  );
  if (error) throw error;
  const rows = (data ?? []) as CollectionRow[];
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map(toCollectionAchievement);
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor:
      hasMore && last
        ? {
            createdAt: last.created_at,
            id: last.id,
            title: last.title,
            rarity: last.rarity,
          }
        : null,
  };
}

export async function getCollectionV2(input: CollectionInput) {
  const page = await getCollectionPage(input, null, 50);
  return page.items;
}

export async function markAchievementCollectionViewed(
  achievementId: string,
  ownerId: string,
) {
  const viewedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("achievements")
    .update({ collection_viewed_at: viewedAt })
    .eq("id", achievementId)
    .eq("owner_id", ownerId)
    .select("id, collection_viewed_at")
    .single();
  if (error) throw error;
  return data;
}

export async function getPublicProfile(ownerId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, username, display_name, bio, avatar_key, onboarding_completed, achievement_count, total_received_likes, friend_count, is_discoverable, map_is_public",
    )
    .eq("id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function getPublicAchievements(ownerId: string) {
  const { data, error } = await supabase
    .from("achievements")
    .select(achievementSelect)
    .eq("owner_id", ownerId)
    .eq("status", "completed")
    .eq("lifecycle_status", "completed")
    .eq("visibility", "public")
    .is("hidden_at", null)
    .is("revoked_at", null)
    .eq("moderation_status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Achievement[];
}

type DiscoverFeedV2Row =
  Database["public"]["Functions"]["get_discover_feed_v2"]["Returns"][number];

export type DiscoverCursor = {
  roundId: string;
  rank: number;
};

export type DiscoverPage = {
  items: Achievement[];
  nextCursor: DiscoverCursor | null;
  hasMore: boolean;
};

function toDiscoverAchievementV2(row: DiscoverFeedV2Row): Achievement {
  return {
    id: row.id,
    owner_id: row.owner_id,
    title: row.title,
    description: row.description,
    category: row.category,
    rarity: row.rarity,
    status: row.status,
    visibility: row.visibility,
    achievement_date: row.achievement_date,
    lifecycle_status: row.lifecycle_status,
    target_date: null,
    hidden_at: null,
    source_kind: "user",
    source_key: null,
    revoked_at: null,
    moderation_status: "active",
    cover_key: row.cover_key,
    cover_url: row.cover_url,
    like_count: row.like_count,
    created_at: row.created_at,
    completed_at: row.completed_at,
    reveal_viewed_at: row.reveal_viewed_at,
    owner: {
      id: row.owner_id,
      username: row.owner_username,
      display_name: row.owner_display_name,
      avatar_key: row.owner_avatar_key,
    },
  };
}

type DiscoverFeedV4Row = DiscoverFeedV2Row & {
  round_id: string;
  rank: number;
};

export async function getDiscoverFeed(
  cursor?: DiscoverCursor | null,
  pageSize = 16,
): Promise<DiscoverPage> {
  const { data, error } = await supabase.rpc(
    "get_discover_feed_v4" as never,
    {
      p_limit: pageSize + 1,
      p_round_id: cursor?.roundId,
      p_after_rank: cursor?.rank ?? 0,
    } as never,
  );
  if (error) throw error;
  const rows = (data ?? []) as DiscoverFeedV4Row[];
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map(toDiscoverAchievementV2);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last
        ? {
            roundId: rows[0].round_id,
            rank: rows[pageSize - 1].rank,
          }
        : null,
    hasMore,
  };
}

export async function resetDiscoverRecommendations() {
  // A reset only makes the current round visible again. Existing likes are
  // deliberately kept as independent user preference data.
  const { error } = await supabase.rpc("reset_discover_round");
  if (error) throw error;
}

export async function applyDiscoverFeedAction(
  achievementId: string,
  action: "skip" | "like" | "not_for_me",
  operationId: string,
) {
  const { data, error } = await supabase.rpc("apply_discover_feedback_v2", {
    p_achievement_id: achievementId,
    p_action: action,
    p_operation_id: operationId,
  });
  if (error) throw error;
  const result = data?.[0];
  if (!result) throw new Error("The feed action did not return a result.");
  return result;
}

export async function recordDiscoverEngagement(
  achievementId: string,
  eventType: "profile_open" | "view",
  operationId: string,
  durationMs?: number,
) {
  const { error } = await supabase.rpc(
    "record_discover_engagement_v1" as never,
    {
      p_achievement_id: achievementId,
      p_event_type: eventType,
      p_duration_ms: durationMs,
      p_operation_id: operationId,
    } as never,
  );
  if (error) throw error;
}

export async function undoDiscoverFeedAction(
  achievementId: string,
  operationId: string,
) {
  const { data, error } = await supabase.rpc("undo_discover_feedback_v2", {
    p_achievement_id: achievementId,
    p_operation_id: operationId,
  });
  if (error) throw error;
  const result = data?.[0];
  if (!result) throw new Error("The feed undo did not return a result.");
  return result;
}

export async function getAchievement(id: string) {
  const { data, error } = await supabase
    .from("achievements")
    .select(achievementSelect)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as Achievement | null;
}

export async function getAchievementEvents(id: string) {
  const { data, error } = await supabase
    .from("achievement_events")
    .select(
      "id, achievement_id, owner_id, kind, event_date, title, note, value, unit, created_at, updated_at",
    )
    .eq("achievement_id", id)
    .eq("moderation_status", "active")
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AchievementEvent[];
}

export async function getNotifications(ownerId: string) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, achievement_id, title, body, link, read_at, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  return (data ?? []) as PatchNotification[];
}

type FriendRow =
  Database["public"]["Functions"]["get_friends_v2"]["Returns"][number];

export type FriendProfile = {
  id: string;
  username: string;
  displayName: string;
  avatarKey: string;
  bio: string | null;
  friendCount: number;
  relationship: "friends" | "incoming" | "outgoing" | "none";
};

function toFriendProfile(row: FriendRow): FriendProfile {
  return {
    id: row.profile_id,
    username: row.username,
    displayName: row.display_name,
    avatarKey: row.avatar_key,
    bio: row.bio,
    friendCount: row.friend_count,
    relationship: row.relationship as FriendProfile["relationship"],
  };
}

export async function getFriends(view: "friends" | "requests") {
  const { data, error } = await supabase.rpc("get_friends_v2", {
    p_view: view,
  });
  if (error) throw error;
  return (data ?? []).map(toFriendProfile);
}

export async function getFriendshipState(profileId: string) {
  const { data, error } = await supabase.rpc("get_friendship_state", {
    p_profile_id: profileId,
  });
  if (error) throw error;
  return data as "none" | "incoming" | "outgoing" | "friends" | "unavailable";
}

export async function searchProfiles(query: string) {
  const normalized = query.trim();
  if (!normalized) return [] as FriendProfile[];
  const { data, error } = await supabase.rpc("search_profiles", {
    p_query: normalized,
    p_limit: 20,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarKey: row.avatar_key,
    bio: row.bio,
    friendCount: row.friend_count,
    relationship: row.relationship as FriendProfile["relationship"] | "none",
  }));
}

type FriendFeedRow =
  Database["public"]["Functions"]["get_friend_feed_v2"]["Returns"][number];

export async function getFriendFeed(limit = 30): Promise<Achievement[]> {
  const { data, error } = await supabase.rpc("get_friend_feed_v2", {
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((row: FriendFeedRow) => ({
    id: row.id,
    owner_id: row.owner_id,
    title: row.title,
    description: row.description,
    category: row.category,
    rarity: row.rarity,
    status: "completed",
    lifecycle_status: "completed",
    target_date: null,
    hidden_at: null,
    source_kind: "user",
    source_key: null,
    revoked_at: null,
    moderation_status: "active",
    visibility: "public",
    achievement_date: row.achievement_date,
    cover_key: row.cover_key,
    cover_url: row.cover_url,
    like_count: row.like_count,
    created_at: row.created_at,
    completed_at: row.achievement_date,
    reveal_viewed_at: null,
    owner: {
      id: row.owner_id,
      username: row.owner_username,
      display_name: row.owner_display_name,
      avatar_key: row.owner_avatar_key,
    },
  }));
}

export async function updateFriendship(
  profileId: string,
  action: "request" | "accept" | "decline" | "cancel" | "remove",
) {
  if (action === "request")
    return supabase.rpc("create_friend_request", { p_profile_id: profileId });
  if (action === "accept" || action === "decline")
    return supabase.rpc("respond_to_friend_request", {
      p_requester_id: profileId,
      p_accept: action === "accept",
    });
  if (action === "cancel")
    return supabase.rpc("cancel_friend_request", { p_profile_id: profileId });
  return supabase.rpc("remove_friend", { p_profile_id: profileId });
}

export async function recordFeedAction(
  achievementId: string,
  action: "skip" | "like" | "dislike",
) {
  const { error } = await supabase.rpc("record_feed_action", {
    p_achievement_id: achievementId,
    p_action: action,
  });
  if (error) throw error;
  if (action === "like" || action === "dislike") {
    const { error: likeError } = await supabase.rpc("toggle_achievement_like", {
      p_achievement_id: achievementId,
      p_liked: action === "like",
    });
    if (likeError) throw likeError;
  }
}
