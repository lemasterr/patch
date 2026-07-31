import type { OfflineOperation } from "@/lib/offline/database";
import { supabase } from "@/lib/supabase";

type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ error: unknown }>;
const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;

function requireRecord(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid queued ${label}.`);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid queued ${label}.`);
  }
  return value;
}

export async function executeOfflineOperation(operation: OfflineOperation) {
  const payload = operation.payload;
  switch (operation.operationType) {
    case "create_patch": {
      const { data, error } = await supabase.functions.invoke<{
        achievementId?: string;
      }>("create-achievement", {
        body: payload,
      });
      if (error) throw error;
      if (!data?.achievementId) {
        throw new Error("The Patch service returned no result.");
      }
      return { achievementId: data.achievementId };
    }
    case "apply_discover_action": {
      const args = requireRecord(payload.args, "Discover action");
      const action = args.p_action;
      if (action !== "like" && action !== "not_for_me" && action !== "skip") {
        throw new Error("Invalid queued Discover action.");
      }
      const { error } = await rpc("apply_discover_feedback_v2", {
        p_achievement_id: requireText(args.p_achievement_id, "Patch id"),
        p_action: action,
        p_operation_id: operation.idempotencyKey,
      });
      if (error) throw error;
      return;
    }
    case "undo_discover_action": {
      const args = requireRecord(payload.args, "Discover undo");
      const { error } = await rpc("undo_discover_feedback_v2", {
        p_achievement_id: requireText(args.p_achievement_id, "Patch id"),
        p_operation_id: operation.idempotencyKey,
      });
      if (error) throw error;
      return;
    }
    case "record_discover_engagement": {
      const args = requireRecord(payload.args, "Discover engagement");
      const eventType = args.p_event_type;
      const duration = args.p_duration_ms;
      if (
        (eventType !== "profile_open" && eventType !== "view") ||
        (duration !== undefined &&
          (typeof duration !== "number" || !Number.isFinite(duration)))
      ) {
        throw new Error("Invalid queued Discover engagement.");
      }
      const { error } = await rpc("record_discover_engagement_v1", {
        p_achievement_id: requireText(args.p_achievement_id, "Patch id"),
        p_event_type: eventType,
        p_duration_ms: duration,
        p_operation_id: operation.idempotencyKey,
      });
      if (error) throw error;
      return;
    }
    case "mark_discover_swipe_guide_seen": {
      const { error } = await rpc("mark_discover_swipe_guide_seen_v1", {
        p_operation_id: operation.idempotencyKey,
      });
      if (error) throw error;
      return;
    }
    default:
      throw new Error(
        `Unsupported offline operation: ${operation.operationType}`,
      );
  }
}
