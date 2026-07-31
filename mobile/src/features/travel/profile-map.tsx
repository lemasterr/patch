import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { focusById, isExplored } from "@/features/travel/country-catalog";
import {
  getOwnTravelVisits,
  getPublicTravelVisits,
} from "@/features/travel/queries";
import type { TravelVisit } from "@/features/travel/types";
import { WorldMap } from "@/features/travel/world-map";
import { palette, spacing, type } from "@/constants/theme";

export function ProfileTravelMap({
  userId,
  ownProfile = false,
  mapIsPublic = false,
}: {
  userId: string;
  ownProfile?: boolean;
  mapIsPublic?: boolean;
}) {
  const [visits, setVisits] = useState<TravelVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    if (!ownProfile && !mapIsPublic)
      return () => {
        active = false;
      };
    void (
      ownProfile ? getOwnTravelVisits(userId) : getPublicTravelVisits(userId)
    )
      .then((next) => {
        if (active) setVisits(next);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mapIsPublic, ownProfile, userId]);

  if (!ownProfile && !mapIsPublic) {
    return <PrivateMapState />;
  }
  if (loading) {
    return (
      <ActivityIndicator
        size="large"
        color={palette.blue}
        style={styles.loader}
      />
    );
  }
  if (error) {
    return <Text style={styles.message}>Could not load this travel map.</Text>;
  }

  const explored = visits.filter((visit) => isExplored(visit.status)).length;
  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open full screen travel map"
        onPress={() =>
          router.push(
            `/map-fullscreen?userId=${encodeURIComponent(userId)}&readonly=1` as Href,
          )
        }
        style={({ pressed }) => [styles.map, pressed && styles.mapPressed]}
      >
        <WorldMap
          visits={visits}
          focus={focusById("world")}
          height={258}
          interactive={false}
        />
        <View pointerEvents="none" style={styles.countPill}>
          <MaterialCommunityIcons
            name="earth"
            size={15}
            color={palette.blueBright}
          />
          <Text style={styles.count}>{explored}/195</Text>
        </View>
      </Pressable>
      <Text style={styles.hint}>Tap the map to explore it full screen.</Text>
    </View>
  );
}

function PrivateMapState() {
  return (
    <View style={styles.private}>
      <MaterialCommunityIcons
        name="lock-outline"
        size={28}
        color={palette.inkMuted}
      />
      <Text style={styles.privateTitle}>Travel map is private</Text>
      <Text style={styles.privateBody}>
        This traveler has not chosen to share their map.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: spacing.xl },
  map: { marginHorizontal: -spacing.sm, position: "relative" },
  mapPressed: { opacity: 0.9 },
  countPill: {
    position: "absolute",
    right: spacing.sm,
    bottom: spacing.sm,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(2, 10, 17, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(224, 244, 255, 0.34)",
  },
  count: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 13,
    fontWeight: "900",
  },
  hint: {
    marginTop: spacing.xs,
    color: palette.inkMuted,
    fontSize: 10,
    textAlign: "center",
  },
  loader: { marginTop: spacing.xxl },
  message: {
    paddingVertical: spacing.xl,
    color: palette.red,
    fontSize: 12,
    textAlign: "center",
  },
  private: {
    minHeight: 250,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  privateTitle: {
    marginTop: spacing.sm,
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 16,
    fontWeight: "900",
  },
  privateBody: {
    marginTop: 4,
    color: palette.inkMuted,
    fontSize: 11,
    textAlign: "center",
  },
});
