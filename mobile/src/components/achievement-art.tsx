import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { radius } from "@/constants/theme";
import { PATCH_ASPECT_RATIO } from "@/constants/patch-layout";
import type { Achievement, AchievementCategory } from "@/types/domain";

const categoryIcons: Record<
  AchievementCategory,
  React.ComponentProps<typeof MaterialCommunityIcons>["name"]
> = {
  adventure: "terrain",
  travel: "map-marker-radius-outline",
  personal: "star-four-points-outline",
  social: "account-group-outline",
  creativity: "palette-outline",
  learning: "book-open-page-variant-outline",
  health: "heart-pulse",
  work: "briefcase-outline",
  everyday: "weather-sunset-up",
  funny: "emoticon-happy-outline",
  other: "shape-outline",
};

const rarityColors = {
  common: ["#7D98B5", "#A9BDD0", "#D5E1ED"],
  rare: ["#1B5597", "#4A86CF", "#AAC9ED"],
  legendary: ["#92611D", "#E4A73B", "#FFE2A0"],
} as const;

export function AchievementArt({
  achievement,
  style,
  framed = false,
}: {
  achievement: Pick<Achievement, "id" | "cover_url" | "category" | "rarity">;
  style?: StyleProp<ViewStyle>;
  framed?: boolean;
}) {
  const colors = rarityColors[achievement.rarity];

  return (
    <View style={[styles.root, framed && styles.framed, style]}>
      {achievement.cover_url ? (
        <Image
          alt=""
          source={{ uri: achievement.cover_url }}
          contentFit="cover"
          contentPosition="center"
          cachePolicy="memory-disk"
          recyclingKey={achievement.id}
          transition={240}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <LinearGradient colors={colors} style={StyleSheet.absoluteFill}>
          <View style={[styles.mountain, styles.mountainLeft]} />
          <View style={[styles.mountain, styles.mountainRight]} />
          <MaterialCommunityIcons
            name={categoryIcons[achievement.category]}
            size={52}
            color="rgba(255,255,255,0.94)"
            style={styles.icon}
          />
        </LinearGradient>
      )}
      <LinearGradient
        colors={["transparent", "rgba(3,18,31,0.18)"]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    aspectRatio: PATCH_ASPECT_RATIO,
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: "#B9CDDF",
  },
  framed: {
    borderWidth: 5,
    borderColor: "rgba(245,185,78,0.96)",
    shadowColor: "#F4B94E",
    shadowOpacity: 0.38,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
  },
  mountain: {
    position: "absolute",
    bottom: -45,
    width: "72%",
    aspectRatio: 1,
    backgroundColor: "rgba(29,72,110,0.55)",
    transform: [{ rotate: "45deg" }],
  },
  mountainLeft: { left: -42 },
  mountainRight: { right: -50, bottom: -58, opacity: 0.72 },
  icon: {
    position: "absolute",
    alignSelf: "center",
    top: "38%",
    textShadowColor: "rgba(7,24,39,0.32)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 2,
  },
});
