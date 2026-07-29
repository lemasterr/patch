import { supabase } from "@/lib/supabase";

export type ProductAnalyticsEvent =
  | "create_started"
  | "create_completed"
  | "reveal"
  | "share"
  | "reaction"
  | "friend_request"
  | "retention";

export type ProductAnalyticsSource =
  "mobile" | "discover" | "profile" | "notification" | "universal_link";

function operationId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    },
  );
}

/** Sends only allow-listed metadata; Patch and profile text are never sent. */
export async function trackProductEvent(
  eventName: ProductAnalyticsEvent,
  subjectId?: string,
  source: ProductAnalyticsSource = "mobile",
) {
  const { error } = await supabase.rpc(
    "record_product_analytics_event_v1" as never,
    {
      p_event_name: eventName,
      p_subject_id: subjectId,
      p_source: source,
      p_operation_id: operationId(),
    } as never,
  );
  if (error) throw error;
}
