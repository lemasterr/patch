import { supabase } from "@/lib/supabase";
import type { Achievement } from "@/types/domain";
import type {
  MapFocusId,
  TravelVisit,
  VisitStatus,
} from "@/features/travel/types";

const visitColumns =
  "country_code, country_name, visited_at, status, visit_month, visit_year, note, updated_at";

// Hermes does not provide Web Crypto's randomUUID on every supported React
// Native runtime. The RPC only needs a collision-resistant, request-scoped
// UUID for idempotency, so keep the same portable generator used by Patch
// creation instead of relying on a browser global.
function createOperationId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    },
  );
}

export async function getOwnTravelVisits(userId: string) {
  const { data, error } = await supabase
    .from("visited_countries")
    .select(visitColumns)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TravelVisit[];
}

export async function getPublicTravelVisits(userId: string) {
  const { data, error } = await supabase.rpc("get_public_profile_map", {
    p_profile_id: userId,
  });
  if (error) throw error;
  return (data ?? []).map((visit) => ({
    ...visit,
    visited_at: "",
    visit_month: null,
    visit_year: null,
    note: null,
    updated_at: "",
  })) as TravelVisit[];
}

export async function saveTravelVisit({
  countryCode,
  countryName,
  status,
  month,
  year,
  note,
}: {
  countryCode: string;
  countryName: string;
  status: VisitStatus;
  month: number | null;
  year: number | null;
  note: string;
}) {
  const { data, error } = await supabase.rpc("set_country_visit_v2", {
    p_country_code: countryCode,
    p_country_name: countryName,
    p_status: status,
    p_visit_month: month ?? undefined,
    p_visit_year: year ?? undefined,
    p_note: note,
    p_operation_id: createOperationId(),
  });
  if (error) throw error;
  return (data?.[0]?.active_patch_ids ?? []) as string[];
}

export async function removeTravelVisit(countryCode: string) {
  const { error } = await supabase.rpc("remove_country_visit_v2", {
    p_country_code: countryCode,
    p_operation_id: createOperationId(),
  });
  if (error) throw error;
}

export async function getTravelAchievements(ownerId: string) {
  const { data, error } = await supabase
    .from("achievements")
    .select(
      "id, owner_id, title, description, category, rarity, status, lifecycle_status, target_date, hidden_at, source_kind, source_key, revoked_at, moderation_status, visibility, achievement_date, cover_key, cover_url, like_count, created_at, completed_at, reveal_viewed_at",
    )
    .eq("owner_id", ownerId)
    .in("source_kind", ["country", "country_milestone", "continent"])
    .order("achievement_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Achievement[];
}

export async function getMapDefaultFocus(userId: string) {
  const { data, error } = await supabase
    .from("user_settings")
    .select("map_default_focus")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.map_default_focus ?? "world") as MapFocusId;
}

export async function setMapDefaultFocus(userId: string, focus: MapFocusId) {
  const { error } = await supabase
    .from("user_settings")
    .update({ map_default_focus: focus })
    .eq("user_id", userId);
  if (error) throw error;
}
