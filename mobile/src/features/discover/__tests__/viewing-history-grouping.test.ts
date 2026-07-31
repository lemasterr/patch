import {
  groupViewingHistory,
  historyDayKey,
} from "../viewing-history-grouping";
import type { RecommendationHistoryItem } from "@/types/domain";

function item(eventId: string, viewedAt: string): RecommendationHistoryItem {
  return {
    eventId,
    viewedAt,
    achievement: {
      id: eventId,
      title: "A Patch",
      category: "learning",
      rarity: "common",
      achievement_date: "2026-03-29",
      cover_key: null,
      cover_url: null,
      owner: {
        id: "owner",
        username: "owner",
        display_name: "Owner",
        avatar_key: "trail",
      },
    },
  };
}

describe("viewing history grouping", () => {
  it("uses the profile IANA zone across the spring DST change", () => {
    expect(
      historyDayKey(new Date("2026-03-29T00:30:00.000Z"), "Europe/Prague"),
    ).toBe("2026-03-29");
    expect(
      historyDayKey(new Date("2026-03-29T22:30:00.000Z"), "Europe/Prague"),
    ).toBe("2026-03-30");
  });

  it("creates separate sections when UTC entries cross local midnight", () => {
    const sections = groupViewingHistory(
      [
        item("later", "2026-03-29T22:30:00.000Z"),
        item("earlier", "2026-03-29T00:30:00.000Z"),
      ],
      "Europe/Prague",
    );

    expect(sections).toHaveLength(2);
    expect(sections.map((section) => section.data[0].eventId)).toEqual([
      "later",
      "earlier",
    ]);
  });
});
