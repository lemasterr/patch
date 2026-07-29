import type { Href } from "expo-router";

export function routeForNotificationLink(link: string): Href {
  if (link === "/friends") return "/friends";
  const profile = link.match(/^\/user\/([^/]+)$/);
  if (profile) return `/user/${profile[1]}` as Href;
  const reveal = link.match(/^\/achievements\/([^/]+)\/reveal/);
  if (reveal) return `/reveal/${reveal[1]}` as Href;
  const detail = link.match(/^\/achievements\/([^/]+)/);
  if (detail) return `/achievement/${detail[1]}` as Href;
  const processing = link.match(/^\/processing\/([^/]+)/);
  if (processing) return `/reveal/${processing[1]}` as Href;
  return "/notifications";
}

export function routeForNotificationData(data?: Record<string, unknown>) {
  if (!data) return null;
  if (
    data.type === "achievement_completed" &&
    typeof data.achievementId === "string"
  ) {
    return `/reveal/${data.achievementId}` as Href;
  }
  if (data.type === "friend_request" || data.type === "friend_accepted") {
    return data.link === "/friends" ? "/friends" : "/notifications";
  }
  return typeof data.link === "string"
    ? routeForNotificationLink(data.link)
    : null;
}
