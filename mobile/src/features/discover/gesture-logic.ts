export type SwipeDirection = "left" | "right" | "up" | "down";
export type DiscoverFeedback = "like" | "not_for_me" | "skip";

export function resolveSwipeDirection(
  translationX: number,
  translationY: number,
  velocityX: number,
  velocityY: number,
  horizontalThreshold: number,
  verticalThreshold: number,
  canUndo: boolean,
  allowNotForMe = true,
): SwipeDirection | null {
  "worklet";
  const horizontal = Math.abs(translationX) >= Math.abs(translationY);
  if (horizontal) {
    if (translationX >= horizontalThreshold || velocityX >= 900) return "right";
    if (
      allowNotForMe &&
      (translationX <= -horizontalThreshold || velocityX <= -900)
    )
      return "left";
    return null;
  }
  if (translationY <= -verticalThreshold || velocityY <= -900) return "up";
  if (canUndo && (translationY >= verticalThreshold || velocityY >= 900))
    return "down";
  return null;
}

export function previewSwipeDirection(
  translationX: number,
  translationY: number,
  threshold: number,
  canUndo: boolean,
  allowNotForMe = true,
): SwipeDirection | null {
  "worklet";
  if (Math.max(Math.abs(translationX), Math.abs(translationY)) < threshold)
    return null;
  if (Math.abs(translationX) >= Math.abs(translationY)) {
    if (!allowNotForMe && translationX < 0) return null;
    return translationX >= 0 ? "right" : "left";
  }
  if (translationY < 0) return "up";
  return canUndo ? "down" : null;
}

export function feedbackForSwipe(
  direction: Exclude<SwipeDirection, "down">,
): DiscoverFeedback {
  "worklet";
  if (direction === "right") return "like";
  if (direction === "left") return "not_for_me";
  return "skip";
}
