import { StyleSheet, Text, View } from "react-native";

import { palette, radius, spacing } from "@/constants/theme";

export function PendingSyncBadge({
  label = "Pending sync",
}: {
  label?: string;
}) {
  return (
    <View accessibilityLabel={label} style={styles.badge}>
      <View style={styles.dot} />
      <Text style={styles.copy}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    backgroundColor: "rgba(244,185,78,0.16)",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  dot: { backgroundColor: palette.gold, borderRadius: 4, height: 7, width: 7 },
  copy: { color: palette.gold, fontSize: 11, fontWeight: "800" },
});
