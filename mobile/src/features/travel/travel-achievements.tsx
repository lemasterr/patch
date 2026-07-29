import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";

import { AchievementArt } from "@/components/achievement-art";
import { twoColumnPatchWidth } from "@/constants/patch-layout";
import { palette, radius, spacing, type } from "@/constants/theme";
import type { TravelVisit } from "@/features/travel/types";
import type { Achievement } from "@/types/domain";

function achievementTime(
  achievement: Achievement,
  visitByCode: Map<string, TravelVisit>,
) {
  if (
    achievement.cover_key?.startsWith("country-") &&
    !achievement.cover_key.startsWith("country-milestone-")
  ) {
    const visit = visitByCode.get(
      achievement.cover_key.slice("country-".length).toUpperCase(),
    );
    if (visit?.visit_year && visit.visit_month) {
      return new Date(visit.visit_year, visit.visit_month - 1).getTime();
    }
    if (visit?.updated_at) return new Date(visit.updated_at).getTime();
  }
  return new Date(achievement.created_at).getTime();
}

export function TravelAchievements({
  achievements,
  visits,
  onOpen,
}: {
  achievements: Achievement[];
  visits: TravelVisit[];
  onOpen: (achievement: Achievement) => void;
}) {
  const [gridWidth, setGridWidth] = useState(0);
  const visitByCode = useMemo(
    () => new Map(visits.map((visit) => [visit.country_code, visit])),
    [visits],
  );
  const earned = useMemo(
    () =>
      achievements
        .filter(
          (achievement) =>
            achievement.revoked_at === null &&
            achievement.lifecycle_status === "completed",
        )
        .sort(
          (a, b) =>
            achievementTime(b, visitByCode) - achievementTime(a, visitByCode),
        ),
    [achievements, visitByCode],
  );
  const tileWidth = gridWidth > 0 ? twoColumnPatchWidth(gridWidth) : undefined;
  const measureGrid = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width && width !== gridWidth) setGridWidth(width);
  };

  if (!earned.length) return null;

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Travel Patches</Text>
      <View onLayout={measureGrid} style={styles.grid}>
        {earned.map((achievement) => (
          <Pressable
            key={achievement.id}
            onPress={() => onOpen(achievement)}
            style={({ pressed }) => [
              styles.card,
              tileWidth ? { width: tileWidth } : styles.unmeasuredCard,
              pressed && styles.pressed,
            ]}
          >
            <AchievementArt achievement={achievement} style={styles.art} />
            <Text numberOfLines={2} style={styles.title}>
              {achievement.title}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: spacing.lg, paddingBottom: spacing.xl },
  heading: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: spacing.sm,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: { alignItems: "center", gap: 5 },
  art: { borderRadius: radius.md, width: "100%" },
  title: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 12,
    textAlign: "center",
  },
  unmeasuredCard: { opacity: 0, width: "48%" },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
});
