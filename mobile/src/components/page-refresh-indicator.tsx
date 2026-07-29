import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { palette, radius, spacing } from "@/constants/theme";
import type { RefreshProgress } from "@/hooks/use-page-refresh";

export function PageRefreshIndicator({
  progress,
}: {
  progress: RefreshProgress;
}) {
  // Pull-to-refresh is already visible through the platform control. Do not
  // leave a second, stale "Updated" pill at the top of the page afterwards.
  if (progress === "idle" || progress === "success") return null;
  const copy =
    progress === "loading"
      ? "Refreshing…"
      : progress === "partial"
        ? "Updated with a few misses"
        : "Couldn’t refresh";
  return (
    <View accessibilityLiveRegion="polite" style={styles.root}>
      {progress === "loading" ? (
        <ActivityIndicator size="small" color={palette.blue} />
      ) : null}
      <Text style={styles.copy}>{copy}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  copy: { color: palette.inkMuted, fontSize: 12, fontWeight: "700" },
});
