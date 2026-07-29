import { radius, spacing } from "@/constants/theme";

/** Every Patch surface is a horizontal physical-patch silhouette (width / height). */
export const PATCH_ASPECT_RATIO = 4 / 3;

export const patchLayout = {
  aspectRatio: PATCH_ASPECT_RATIO,
  frameRadius: radius.lg,
  tileRadius: radius.md,
  thumbnailWidth: 56,
  thumbnailHeight: 42,
  gridGap: spacing.md,
  tabBarHeight: 54,
  tabBarBottomOffset: 10,
  /** Screen content clearance for the floating compact tab bar. */
  tabBarClearance: 104,
} as const;

/** Width of one Patch in a two-column gallery with an already-padded container. */
export function twoColumnPatchWidth(availableWidth: number) {
  return (availableWidth - patchLayout.gridGap) / 2;
}
