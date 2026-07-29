import {
  routeForNotificationData,
  routeForNotificationLink,
} from "../notification-route";

describe("push tap routes", () => {
  it("routes Patch, reveal, processing, and social notifications", () => {
    expect(routeForNotificationLink("/achievements/a/reveal")).toBe(
      "/reveal/a",
    );
    expect(routeForNotificationLink("/achievements/a")).toBe("/achievement/a");
    expect(routeForNotificationLink("/processing/a")).toBe("/reveal/a");
    expect(
      routeForNotificationData({ type: "friend_request", link: "/friends" }),
    ).toBe("/friends");
    expect(routeForNotificationLink("/user/a-person")).toBe("/user/a-person");
  });

  it("uses safe fallback routes for incomplete payloads", () => {
    expect(routeForNotificationData()).toBeNull();
    expect(routeForNotificationData({ link: "/unknown" })).toBe(
      "/notifications",
    );
  });
});
