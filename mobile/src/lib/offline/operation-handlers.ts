import { supabase } from "@/lib/supabase";
import type { OfflineOperation } from "@/lib/offline/database";

type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ error: unknown }>;
const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;

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
      if (!data?.achievementId)
        throw new Error("The Patch service returned no result.");
      return { achievementId: data.achievementId };
    }
    case "mark_notification_read": {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: String(payload.readAt) })
        .eq("id", String(payload.notificationId))
        .eq("owner_id", operation.userId);
      if (error) throw error;
      return;
    }
    case "update_settings": {
      const settings: {
        browser_notifications?: boolean;
        default_visibility?: "public" | "private";
        in_app_notifications?: boolean;
        like_notifications?: boolean;
        map_default_focus?: string;
        theme?: "system" | "light" | "dark";
      } = {};
      if (typeof payload.browser_notifications === "boolean")
        settings.browser_notifications = payload.browser_notifications;
      if (
        payload.default_visibility === "public" ||
        payload.default_visibility === "private"
      )
        settings.default_visibility = payload.default_visibility;
      if (typeof payload.in_app_notifications === "boolean")
        settings.in_app_notifications = payload.in_app_notifications;
      if (typeof payload.like_notifications === "boolean")
        settings.like_notifications = payload.like_notifications;
      if (typeof payload.map_default_focus === "string")
        settings.map_default_focus = payload.map_default_focus;
      if (
        payload.theme === "system" ||
        payload.theme === "light" ||
        payload.theme === "dark"
      )
        settings.theme = payload.theme;
      const { error } = await supabase
        .from("user_settings")
        .update(settings)
        .eq("user_id", operation.userId);
      if (error) throw error;
      return;
    }
    case "update_bio": {
      const { error } = await supabase
        .from("profiles")
        .update({
          bio:
            typeof payload.bio === "string" && payload.bio.trim()
              ? payload.bio.trim()
              : null,
        })
        .eq("id", operation.userId);
      if (error) throw error;
      return;
    }
    case "set_patch_hidden":
    case "set_patch_lifecycle":
    case "add_patch_event":
    case "update_patch_event":
    case "update_system_travel_patch":
    case "apply_discover_action":
    case "undo_discover_action":
    case "record_discover_engagement":
    case "send_friend_request":
    case "respond_friend_request":
    case "cancel_friend_request":
    case "remove_friend":
    case "set_country_visit": {
      const rpcName = String(payload.rpcName ?? operation.operationType);
      const { error } = await rpc(rpcName, {
        ...(payload.args as Record<string, unknown>),
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
