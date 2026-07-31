import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AchievementArt } from "@/components/achievement-art";
import { patchLayout } from "@/constants/patch-layout";
import { countryFlag, statusMeta } from "@/features/travel/country-catalog";
import type { TravelVisit } from "@/features/travel/types";
import type { WorldLocation } from "@/features/travel/world-map";
import { spacing, type, type SemanticPalette } from "@/constants/theme";
import { useTheme } from "@/providers/theme-provider";
import type { Achievement } from "@/types/domain";

function countryAchievements(
  country: WorldLocation,
  achievements: Achievement[],
) {
  const code = country.id.toLowerCase();
  return achievements.filter(
    (achievement) => achievement.cover_key?.toLowerCase() === `country-${code}`,
  );
}

export function CountryAchievementModal({
  country,
  visit,
  achievements,
  onClose,
  onDismiss,
  onOpenAchievement,
}: {
  country: WorldLocation | null;
  visit?: TravelVisit;
  achievements: Achievement[];
  onClose: () => void;
  onDismiss?: () => void;
  onOpenAchievement: (achievement: Achievement) => void;
}) {
  const styles = useCountryAchievementStyles();
  return (
    <Modal
      visible={Boolean(country)}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <View style={styles.root}>
        <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
          <CountryAchievementContent
            country={country}
            visit={visit}
            achievements={achievements}
            onClose={onClose}
            onOpenAchievement={onOpenAchievement}
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function CountryAchievementContent({
  country,
  visit,
  achievements,
  onClose,
  onOpenAchievement,
}: {
  country: WorldLocation | null;
  visit?: TravelVisit;
  achievements: Achievement[];
  onClose: () => void;
  onOpenAchievement: (achievement: Achievement) => void;
}) {
  const { colors } = useTheme();
  const styles = useCountryAchievementStyles();
  const unlocked = country ? countryAchievements(country, achievements) : [];
  const meta = visit ? statusMeta[visit.status] : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.identity}>
          <Text style={styles.flag}>
            {country ? countryFlag(country.id) : ""}
          </Text>
          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.title}>
              {country?.name}
            </Text>
            <Text style={[styles.status, meta ? { color: meta.color } : null]}>
              {meta?.label ?? "Not visited yet"}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel="Back to countries"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.close}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={20}
            color={colors.ink}
          />
        </Pressable>
      </View>
      {visit?.note?.trim() ? (
        <Text style={styles.note}>{visit.note}</Text>
      ) : null}
      <View style={styles.rewardHeader}>
        <Text style={styles.rewardTitle}>My Patches</Text>
        <View style={styles.rewardCount}>
          <Text style={styles.rewardCountText}>{unlocked.length}</Text>
        </View>
      </View>
      {unlocked.length ? (
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.achievements}
          showsVerticalScrollIndicator={false}
        >
          {unlocked.map((achievement) => (
            <Pressable
              key={achievement.id}
              accessibilityLabel={`Open ${achievement.title}`}
              accessibilityRole="button"
              onPress={() => onOpenAchievement(achievement)}
              style={styles.achievement}
            >
              <AchievementArt achievement={achievement} style={styles.art} />
              <Text numberOfLines={2} style={styles.achievementTitle}>
                {achievement.title}
              </Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={18}
                color={colors.inkMuted}
              />
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.empty}>
          {visit
            ? "No Patch has been unlocked here yet."
            : "Add this country to start its travel story."}
        </Text>
      )}
    </View>
  );
}

function useCountryAchievementStyles() {
  const { colors } = useTheme();
  return useMemo(() => createStyles(colors), [colors]);
}

function createStyles(colors: SemanticPalette) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    safeArea: {
      flex: 1,
      paddingHorizontal: spacing.lg,
    },
    card: {
      width: "100%",
      flex: 1,
      paddingTop: spacing.md,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    identity: {
      minWidth: 0,
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    flag: { fontSize: 34 },
    copy: { minWidth: 0, flex: 1 },
    title: {
      color: colors.ink,
      fontFamily: type.rounded,
      fontSize: 20,
      fontWeight: "900",
    },
    status: {
      marginTop: 2,
      color: colors.inkMuted,
      fontSize: 11,
      fontWeight: "800",
    },
    close: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceMuted,
    },
    note: {
      marginTop: spacing.sm,
      color: colors.inkMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    rewardHeader: {
      marginTop: spacing.lg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    rewardTitle: {
      color: colors.ink,
      fontFamily: type.rounded,
      fontSize: 14,
      fontWeight: "900",
    },
    rewardCount: {
      minWidth: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${colors.blue}2E`,
    },
    rewardCountText: {
      color: colors.blueBright,
      fontFamily: type.rounded,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: "900",
      textAlign: "center",
    },
    achievements: { paddingTop: spacing.sm, gap: spacing.xs },
    achievement: {
      minHeight: 58,
      paddingVertical: spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    art: {
      width: patchLayout.thumbnailWidth,
      height: patchLayout.thumbnailHeight,
      borderRadius: 12,
    },
    achievementTitle: {
      flex: 1,
      color: colors.ink,
      fontSize: 12,
      fontWeight: "800",
    },
    empty: {
      marginTop: spacing.sm,
      paddingVertical: spacing.xl,
      color: colors.inkMuted,
      fontSize: 12,
      lineHeight: 17,
      textAlign: "center",
    },
  });
}
