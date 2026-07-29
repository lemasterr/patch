import * as Haptics from "expo-haptics";
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { ActionSheet, type ActionSheetItem } from "@/components/action-sheet";
import { HeaderIcon, PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { patchLayout } from "@/constants/patch-layout";
import {
  focusByCountryCode,
  focusById,
  isExplored,
  MAP_HEIGHT,
  MAP_WIDTH,
  mapFocuses,
  WORLD_COUNTRY_TOTAL,
} from "@/features/travel/country-catalog";
import { CountryEditor } from "@/features/travel/country-editor";
import { CountryPicker } from "@/features/travel/country-picker";
import {
  getMapDefaultFocus,
  getOwnTravelVisits,
  getTravelAchievements,
  removeTravelVisit,
  saveTravelVisit,
  setMapDefaultFocus,
} from "@/features/travel/queries";
import { TravelAchievements } from "@/features/travel/travel-achievements";
import { TravelListSheet } from "@/features/travel/travel-list-sheet";
import type {
  MapFocus,
  MapFocusId,
  TravelVisit,
  VisitStatus,
} from "@/features/travel/types";
import { WorldMap, type WorldLocation } from "@/features/travel/world-map";
import { useAuth } from "@/providers/auth-provider";
import { palette, radius, spacing, type } from "@/constants/theme";
import type { Achievement } from "@/types/domain";

type ListKind = "explored" | VisitStatus;

export default function MapScreen() {
  const { session } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const [visits, setVisits] = useState<TravelVisit[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [focusId, setFocusId] = useState<MapFocusId>("world");
  const [cameraFocus, setCameraFocus] = useState<MapFocus>(() =>
    focusById("world"),
  );
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [listKind, setListKind] = useState<ListKind | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<WorldLocation | null>(
    null,
  );
  const [editing, setEditing] = useState<WorldLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasLoadedMap = useRef(false);
  const pendingCountry = useRef<WorldLocation | null>(null);
  const pendingRevealId = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    if (!hasLoadedMap.current) setLoading(true);
    try {
      const [nextVisits, nextAchievements, nextFocus] = await Promise.all([
        getOwnTravelVisits(session.user.id),
        getTravelAchievements(session.user.id),
        getMapDefaultFocus(session.user.id),
      ]);
      setVisits(nextVisits);
      setAchievements(nextAchievements);
      setFocusId(nextFocus);
      setCameraFocus(focusById(nextFocus));
      hasLoadedMap.current = true;
    } catch {
      setMessage("Could not load your travel map.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visitByCode = useMemo(
    () => new Map(visits.map((visit) => [visit.country_code, visit])),
    [visits],
  );
  const exploredCount = visits.filter((visit) =>
    isExplored(visit.status),
  ).length;
  const livedCount = visits.filter((visit) => visit.status === "lived").length;
  const wishlistCount = visits.filter(
    (visit) => visit.status === "wishlist",
  ).length;
  const mapHeight = Math.round(screenWidth * (MAP_HEIGHT / MAP_WIDTH));

  function presentCountry(country: WorldLocation) {
    setSelectedCountry(country);
    setEditing(country);
    setCameraFocus(focusByCountryCode(country.id, country.name));
    setMessage(null);
    void Haptics.selectionAsync();
  }

  function selectCountry(country: WorldLocation) {
    pendingCountry.current = country;
    setPickerOpen(false);
    if (Platform.OS !== "ios") {
      requestAnimationFrame(() => {
        const nextCountry = pendingCountry.current;
        pendingCountry.current = null;
        if (nextCountry) presentCountry(nextCountry);
      });
    }
  }

  function finishPickerDismissal() {
    const country = pendingCountry.current;
    pendingCountry.current = null;
    if (country) presentCountry(country);
  }

  function finishEditorDismissal() {
    const achievementId = pendingRevealId.current;
    pendingRevealId.current = null;
    if (achievementId) router.push(`/reveal/${achievementId}`);
  }

  async function saveCountry(value: {
    status: VisitStatus;
    month: number | null;
    year: number | null;
    note: string;
  }) {
    if (!session || !editing) return;
    setSaving(true);
    setMessage(null);
    try {
      const unlocked = await saveTravelVisit({
        countryCode: editing.id.toUpperCase(),
        countryName: editing.name,
        ...value,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      pendingRevealId.current = unlocked[0] ?? null;
      setEditing(null);
      setSelectedCountry(null);
      await load();
      if (Platform.OS !== "ios") finishEditorDismissal();
    } catch {
      setMessage("Could not save this country.");
    } finally {
      setSaving(false);
    }
  }

  async function removeCountry() {
    if (!session || !editing) return;
    setSaving(true);
    setMessage(null);
    try {
      await removeTravelVisit(editing.id.toUpperCase());
      setEditing(null);
      setSelectedCountry(null);
      await load();
    } catch {
      setMessage("Could not remove this country.");
    } finally {
      setSaving(false);
    }
  }

  async function applyFocus(nextFocus: MapFocusId) {
    if (!session) return;
    const previous = focusId;
    setFocusId(nextFocus);
    setCameraFocus(focusById(nextFocus));
    setFocusOpen(false);
    try {
      await setMapDefaultFocus(session.user.id, nextFocus);
      await Haptics.selectionAsync();
    } catch {
      setFocusId(previous);
      setCameraFocus(focusById(previous));
      setMessage("Could not save your map focus.");
    }
  }

  const focusItems: ActionSheetItem[] = mapFocuses.map((focus) => ({
    icon: focus.id === focusId ? "check-circle" : "map-outline",
    label: focus.label,
    detail:
      focus.id === focusId ? "Default and in use" : "Use now and make default",
    onPress: () => void applyFocus(focus.id),
  }));

  return (
    <Screen>
      <PatchHeader
        title="My World Patches"
        showNotifications={false}
        right={
          <>
            <HeaderIcon
              icon="plus"
              label="Choose country"
              onPress={() => setPickerOpen(true)}
            />
            <HeaderIcon
              icon="cog-outline"
              label="Map focus settings"
              onPress={() => setFocusOpen(true)}
            />
          </>
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {message && !editing ? (
          <Text style={styles.message}>{message}</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open interactive world map"
          onPress={() =>
            router.push(`/map-fullscreen?focus=${focusId}` as Href)
          }
          style={({ pressed }) => [
            styles.mapArea,
            pressed && styles.mapPressed,
          ]}
        >
          <WorldMap
            visits={visits}
            focus={cameraFocus}
            selectedCountryCode={selectedCountry?.id}
            height={mapHeight}
            interactive={false}
          />
          <View pointerEvents="none" style={styles.mapCountOverlay}>
            <Text style={styles.mapCountText}>
              {exploredCount}/{WORLD_COUNTRY_TOTAL}
            </Text>
          </View>
          {loading ? (
            <View pointerEvents="none" style={styles.mapLoading}>
              <ActivityIndicator color={palette.blue} />
            </View>
          ) : null}
        </Pressable>
        <View style={styles.stats}>
          <StatButton
            value={exploredCount}
            label="Visited"
            color={palette.blueBright}
            onPress={() => setListKind("explored")}
          />
          <StatButton
            value={livedCount}
            label="Lived"
            color={palette.green}
            onPress={() => setListKind("lived")}
          />
          <StatButton
            value={wishlistCount}
            label="Wishlist"
            color={palette.lilac}
            onPress={() => setListKind("wishlist")}
          />
        </View>
        <TravelAchievements
          achievements={achievements}
          visits={visits}
          onOpen={(achievement) =>
            router.push(`/achievement/${achievement.id}`)
          }
        />
      </ScrollView>

      <CountryPicker
        visible={pickerOpen}
        visits={visits}
        onChoose={selectCountry}
        onClose={() => setPickerOpen(false)}
        onDismiss={finishPickerDismissal}
      />
      <CountryEditor
        country={editing}
        visit={editing ? visitByCode.get(editing.id.toUpperCase()) : undefined}
        saving={saving}
        message={editing ? message : null}
        onSave={(value) => void saveCountry(value)}
        onRemove={() => void removeCountry()}
        onClose={() => {
          setEditing(null);
          setSelectedCountry(null);
        }}
        onDismiss={finishEditorDismissal}
      />
      <TravelListSheet
        kind={listKind}
        visits={visits}
        achievements={achievements}
        onClose={() => setListKind(null)}
        onOpenAchievement={(achievement) =>
          router.push(`/achievement/${achievement.id}`)
        }
      />
      <ActionSheet
        visible={focusOpen}
        title="Default map focus"
        items={focusItems}
        onClose={() => setFocusOpen(false)}
      />
    </Screen>
  );
}

function StatButton({
  value,
  label,
  color,
  onPress,
}: {
  value: number;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Show ${label} countries`}
      onPress={onPress}
      style={({ pressed }) => [styles.statButton, pressed && styles.pressed]}
    >
      <View style={styles.statCopy}>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.sm,
    paddingBottom: patchLayout.tabBarClearance,
  },
  stats: { marginTop: spacing.sm, flexDirection: "row", gap: spacing.xs },
  statButton: {
    flex: 1,
    minHeight: 62,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  statCopy: { alignItems: "center", justifyContent: "center" },
  statValue: {
    fontFamily: type.rounded,
    fontSize: 21,
    lineHeight: 23,
    fontWeight: "900",
  },
  statLabel: {
    marginTop: 2,
    color: palette.inkMuted,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  message: {
    paddingBottom: spacing.xs,
    color: palette.red,
    fontSize: 11,
    textAlign: "center",
  },
  mapArea: {
    marginHorizontal: -spacing.sm,
    justifyContent: "center",
    position: "relative",
  },
  mapLoading: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(6, 17, 26, 0.22)",
  },
  mapPressed: { opacity: 0.9 },
  mapCountOverlay: {
    position: "absolute",
    right: spacing.sm,
    bottom: spacing.sm,
    minWidth: 64,
    height: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(2, 10, 17, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(224, 244, 255, 0.34)",
  },
  mapCountText: {
    color: palette.white,
    fontFamily: type.rounded,
    fontSize: 13,
    fontWeight: "900",
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
});
