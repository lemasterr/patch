import {
  feedbackForSwipe,
  previewSwipeDirection,
  resolveSwipeDirection,
} from "../gesture-logic";

describe("Discover gesture mapping", () => {
  const thresholds = [100, 120] as const;
  it("maps all four accepted directions", () => {
    expect(resolveSwipeDirection(-140, 0, 0, 0, ...thresholds, false)).toBe(
      "left",
    );
    expect(resolveSwipeDirection(140, 0, 0, 0, ...thresholds, false)).toBe(
      "right",
    );
    expect(resolveSwipeDirection(0, -150, 0, 0, ...thresholds, false)).toBe(
      "up",
    );
    expect(resolveSwipeDirection(0, 150, 0, 0, ...thresholds, true)).toBe(
      "down",
    );
  });
  it("rejects short, diagonal, and unavailable undo swipes", () => {
    expect(
      resolveSwipeDirection(30, 40, 0, 0, ...thresholds, false),
    ).toBeNull();
    expect(resolveSwipeDirection(130, -140, 0, 0, ...thresholds, false)).toBe(
      "up",
    );
    expect(
      resolveSwipeDirection(0, 150, 0, 0, ...thresholds, false),
    ).toBeNull();
    expect(previewSwipeDirection(-90, 0, 80, false)).toBe("left");
  });
  it("uses the product feedback contract", () => {
    expect(feedbackForSwipe("left")).toBe("not_for_me");
    expect(feedbackForSwipe("right")).toBe("like");
    expect(feedbackForSwipe("up")).toBe("skip");
  });
  it("does not offer Not for me while replaying previous recommendations", () => {
    expect(
      resolveSwipeDirection(-140, 0, 0, 0, ...thresholds, false, false),
    ).toBeNull();
    expect(previewSwipeDirection(-90, 0, 80, false, false)).toBeNull();
  });
});
