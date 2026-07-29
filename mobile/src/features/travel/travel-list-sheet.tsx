import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  countryFlag,
  isExplored,
  monthLabels,
  statusMeta,
} from "@/features/travel/country-catalog";
import { CountryAchievementContent } from "@/features/travel/country-achievement-modal";
import type { TravelVisit, VisitStatus } from "@/features/travel/types";
import { countryByCode, type WorldLocation } from "@/features/travel/world-map";
import { palette, spacing, type } from "@/constants/theme";
import type { Achievement } from "@/types/domain";

type ListKind = "explored" | VisitStatus;

const titles: Record<ListKind, string> = {
  explored: "Visited countries",
  visited: "Visited countries",
  lived: "Lived in",
  wishlist: "Wishlist",
};

function travelTime(visit: TravelVisit) {
  if (visit.visit_year && visit.visit_month) {
    return new Date(visit.visit_year, visit.visit_month - 1).getTime();
  }
  return new Date(visit.updated_at || visit.visited_at || 0).getTime();
}

function dateLabel(visit: TravelVisit) {
  if (visit.visit_year && visit.visit_month) {
    return `${monthLabels[visit.visit_month - 1]} ${visit.visit_year}`;
  }
  return visit.status === "wishlist" ? "Date not set" : "Recently updated";
}

export function TravelListSheet({
  kind,
  visits,
  achievements,
  onClose,
  onOpenAchievement,
}: {
  kind: ListKind | null;
  visits: TravelVisit[];
  achievements: Achievement[];
  onClose: () => void;
  onOpenAchievement: (achievement: Achievement) => void;
}) {
  const [selectedVisit, setSelectedVisit] = useState<TravelVisit | null>(null);
  const pendingAchievement = useRef<Achievement | null>(null);
  const items = useMemo(() => {
    if (!kind) return [];
    return visits
      .filter((visit) =>
        kind === "explored" ? isExplored(visit.status) : visit.status === kind,
      )
      .sort((a, b) => travelTime(b) - travelTime(a));
  }, [kind, visits]);

  return (
    <Modal
      visible={Boolean(kind)}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={() => {
        const achievement = pendingAchievement.current;
        pendingAchievement.current = null;
        setSelectedVisit(null);
        if (achievement) onOpenAchievement(achievement);
      }}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.root}>
        {selectedVisit ? (
          <View style={styles.details}>
            <CountryAchievementContent
              country={
                (countryByCode.get(selectedVisit.country_code.toUpperCase()) as
                  WorldLocation | undefined) ?? null
              }
              visit={selectedVisit}
              achievements={achievements}
              onClose={() => setSelectedVisit(null)}
              onOpenAchievement={(achievement) => {
                pendingAchievement.current = achievement;
                onClose();
                if (Platform.OS !== "ios") {
                  requestAnimationFrame(() => {
                    const nextAchievement = pendingAchievement.current;
                    pendingAchievement.current = null;
                    setSelectedVisit(null);
                    if (nextAchievement) onOpenAchievement(nextAchievement);
                  });
                }
              }}
            />
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>
                  {kind ? titles[kind] : "Countries"}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close"
                onPress={onClose}
                style={styles.close}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={22}
                  color={palette.ink}
                />
              </Pressable>
            </View>
            <FlatList
              data={items}
              keyExtractor={(visit) => visit.country_code}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <Text style={styles.empty}>Nothing here yet.</Text>
              }
              renderItem={({ item, index }) => (
                <Pressable
                  accessibilityLabel={`Show ${item.country_name} Patches`}
                  onPress={() => setSelectedVisit(item)}
                  style={[
                    styles.row,
                    index < items.length - 1 && styles.border,
                  ]}
                >
                  <Text style={styles.flag}>
                    {countryFlag(item.country_code)}
                  </Text>
                  <View style={styles.copy}>
                    <Text style={styles.name}>{item.country_name}</Text>
                    <Text numberOfLines={1} style={styles.meta}>
                      {dateLabel(item)}
                      {item.note ? ` · ${item.note}` : ""}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.status,
                      { color: statusMeta[item.status].color },
                    ]}
                  >
                    {statusMeta[item.status].label}
                  </Text>
                </Pressable>
              )}
            />
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: {
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 22,
    fontWeight: "900",
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: spacing.lg,
  },
  details: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  row: {
    minHeight: 62,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  flag: { width: 30, fontSize: 23, textAlign: "center" },
  copy: { flex: 1 },
  name: { color: palette.ink, fontSize: 13, fontWeight: "800" },
  meta: { marginTop: 2, color: palette.inkMuted, fontSize: 9 },
  status: { maxWidth: 68, fontSize: 9, fontWeight: "900", textAlign: "right" },
  empty: {
    padding: spacing.lg,
    color: palette.inkMuted,
    fontSize: 12,
    textAlign: "center",
  },
});
