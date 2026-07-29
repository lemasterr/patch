export type AchievementCategory =
  | "adventure"
  | "travel"
  | "personal"
  | "social"
  | "creativity"
  | "learning"
  | "health"
  | "work"
  | "everyday"
  | "funny"
  | "other";

export type AchievementRarity = "common" | "rare" | "legendary";

export type PatchLifecycleStatus = "locked" | "in_progress" | "completed";

export type AchievementStatus = "draft" | "processing" | "completed" | "failed";

export type Achievement = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  status: AchievementStatus;
  lifecycle_status: PatchLifecycleStatus;
  target_date: string | null;
  hidden_at: string | null;
  source_kind: "user" | "country" | "country_milestone" | "continent";
  source_key: string | null;
  revoked_at: string | null;
  moderation_status: "active" | "under_review" | "hidden" | "removed";
  visibility: "public" | "private";
  achievement_date: string;
  cover_key: string | null;
  cover_url: string | null;
  like_count: number;
  created_at: string;
  completed_at: string | null;
  reveal_viewed_at: string | null;
  owner?: Pick<Profile, "id" | "username" | "display_name" | "avatar_key">;
};

export type AchievementEvent = {
  id: string;
  achievement_id: string;
  owner_id: string;
  kind: "created" | "progress" | "completed" | "note";
  event_date: string;
  title: string | null;
  note: string | null;
  value: number | null;
  unit: string | null;
  created_at: string;
  updated_at: string;
};

/** Owner-only lifecycle data returned for the signed-in user's collection. */
export type OwnedAchievement = Achievement & {
  collection_viewed_at: string | null;
};

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_key: string;
  onboarding_completed: boolean;
  achievement_count: number;
  total_received_likes: number;
  friend_count: number;
  is_discoverable?: boolean;
  map_is_public?: boolean;
};

export type PatchNotification = {
  id: string;
  type:
    | "achievement_completed"
    | "achievement_failed"
    | "achievement_liked"
    | "friend_request"
    | "friend_accepted";
  achievement_id: string | null;
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  created_at: string;
};
