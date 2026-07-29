import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  focusByCountryCode,
  focusById,
  isExplored,
  mapFocuses,
  WORLD_COUNTRY_TOTAL,
} from "@/features/travel/country-catalog";
import { CountryAchievementModal } from "@/features/travel/country-achievement-modal";
import { CountryEditor } from "@/features/travel/country-editor";
import { CountryPicker } from "@/features/travel/country-picker";
import {
  getOwnTravelVisits,
  getPublicTravelVisits,
  getTravelAchievements,
  removeTravelVisit,
  saveTravelVisit,
} from "@/features/travel/queries";
import type {
  MapFocus,
  MapFocusId,
  TravelVisit,
  VisitStatus,
} from "@/features/travel/types";
import { WorldMap, type WorldLocation } from "@/features/travel/world-map";
import { palette, radius, spacing, type } from "@/constants/theme";
import { useAuth } from "@/providers/auth-provider";
import type { Achievement } from "@/types/domain";

function validFocus(value: string | undefined): value is MapFocusId {
  return mapFocuses.some((focus) => focus.id === value);
}

export default function FullscreenMapScreen() {
  const { session } = useAuth();
  const params = useLocalSearchParams<{
    focus?: string;
    userId?: string;
    readonly?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const profileId = params.userId ?? session?.user.id;
  const ownMap = Boolean(profileId && profileId === session?.user.id);
  const readOnly = params.readonly === "1" || !ownMap;
  const initialFocus = validFocus(params.focus) ? params.focus : "world";
  const [focus, setFocus] = useState<MapFocus>(() => focusById(initialFocus));
  const [visits, setVisits] = useState<TravelVisit[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<WorldLocation | null>(null);
  const [editing, setEditing] = useState<WorldLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pendingCountry = useRef<WorldLocation | null>(null);
  const pendingRevealId = useRef<string | null>(null);
  const pendingAchievement = useRef<Achievement | null>(null);

  const load = useCallback(async () => {
    if (!profileId) return;
    try {
      const [nextVisits, nextAchievements] = await Promise.all([
        ownMap
          ? getOwnTravelVisits(profileId)
          : getPublicTravelVisits(profileId),
        getTravelAchievements(profileId),
      ]);
      setVisits(nextVisits);
      setAchievements(nextAchievements);
    } catch {
      setMessage("Could not load this map.");
    } finally {
      setLoading(false);
    }
  }, [ownMap, profileId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const visitByCode = useMemo(
    () => new Map(visits.map((visit) => [visit.country_code, visit])),
    [visits],
  );
  const visitedCount = visits.filter((visit) =>
    isExplored(visit.status),
  ).length;
  const selectedVisit = selected
    ? visitByCode.get(selected.id.toUpperCase())
    : undefined;

  function presentCountry(country: WorldLocation, moveCamera: boolean) {
    void Haptics.selectionAsync();
    if (moveCamera) setFocus(focusByCountryCode(country.id, country.name));
    if (readOnly) {
      if (visitByCode.has(country.id.toUpperCase())) setSelected(country);
      return;
    }
    setEditing(country);
  }

  function chooseCountry(country: WorldLocation) {
    pendingCountry.current = country;
    setPickerOpen(false);
    if (Platform.OS !== "ios") {
      requestAnimationFrame(() => {
        const nextCountry = pendingCountry.current;
        pendingCountry.current = null;
        if (nextCountry) presentCountry(nextCountry, true);
      });
    }
  }

  function finishPickerDismissal() {
    const country = pendingCountry.current;
    pendingCountry.current = null;
    if (country) presentCountry(country, true);
  }

  function finishEditorDismissal() {
    const achievementId = pendingRevealId.current;
    pendingRevealId.current = null;
    if (achievementId) router.push(`/reveal/${achievementId}`);
  }

  function finishCountryDetailsDismissal() {
    const achievement = pendingAchievement.current;
    pendingAchievement.current = null;
    if (achievement) router.push(`/achievement/${achievement.id}`);
  }

  async function saveCountry(value: {
    status: VisitStatus;
    month: number | null;
    year: number | null;
    note: string;
  }) {
    if (!editing) return;
    setSaving(true);
    setMessage(null);
    try {
      const unlocked = await saveTravelVisit({
        countryCode: editing.id.toUpperCase(),
        countryName: editing.name,
        ...value,
      });
      pendingRevealId.current = unlocked[0] ?? null;
      setEditing(null);
      await load();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    try {
      await removeTravelVisit(editing.id.toUpperCase());
      setEditing(null);
      await load();
    } catch {
      setMessage("Could not remove this country.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.root}>
      <WorldMap
        visits={visits}
        focus={focus}
        selectedCountryCode={(editing ?? selected)?.id}
        onCountryPress={(country) => presentCountry(country, true)}
        height={height}
        borderRadius={0}
      />

      <View style={[styles.topActions, { top: insets.top + spacing.xs }]}>
        <Pressable
          accessibilityLabel="Close map"
          onPress={() => router.back()}
          style={styles.roundButton}
        >
          <MaterialCommunityIcons
            name="close"
            size={24}
            color={palette.white}
          />
        </Pressable>
        {!readOnly ? (
          <Pressable
            accessibilityLabel="Choose country"
            onPress={() => setPickerOpen(true)}
            style={styles.roundButton}
          >
            <MaterialCommunityIcons
              name="plus"
              size={24}
              color={palette.white}
            />
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open all countries"
        hitSlop={10}
        onPress={() => setPickerOpen(true)}
        style={({ pressed }) => [
          styles.countOverlay,
          { bottom: insets.bottom + spacing.md },
          pressed && styles.countOverlayPressed,
        ]}
      >
        <Text style={styles.countText}>
          {visitedCount}/{WORLD_COUNTRY_TOTAL}
        </Text>
      </Pressable>

      {loading ? (
        <View pointerEvents="none" style={styles.loading}>
          <ActivityIndicator size="large" color={palette.blueBright} />
        </View>
      ) : null}
      {message && !editing ? (
        <Pressable onPress={() => setMessage(null)} style={styles.message}>
          <Text style={styles.messageText}>{message}</Text>
        </Pressable>
      ) : null}

      <CountryPicker
        visible={pickerOpen}
        visits={visits}
        onChoose={chooseCountry}
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
        onClose={() => setEditing(null)}
        onDismiss={finishEditorDismissal}
      />
      <CountryAchievementModal
        country={selected}
        visit={selectedVisit}
        achievements={achievements}
        onClose={() => setSelected(null)}
        onDismiss={finishCountryDetailsDismissal}
        onOpenAchievement={(achievement) => {
          pendingAchievement.current = achievement;
          setSelected(null);
          if (Platform.OS !== "ios") {
            requestAnimationFrame(finishCountryDetailsDismissal);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#06111A" },
  topActions: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(2, 10, 17, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(224, 244, 255, 0.34)",
  },
  countOverlay: {
    position: "absolute",
    right: spacing.md,
    minWidth: 72,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(2, 10, 17, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(224, 244, 255, 0.38)",
    zIndex: 3,
  },
  countOverlayPressed: {
    backgroundColor: "rgba(51, 91, 119, 0.96)",
    transform: [{ scale: 0.97 }],
  },
  countText: {
    color: palette.white,
    fontFamily: type.rounded,
    fontSize: 15,
    fontWeight: "900",
  },
  loading: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(2, 10, 17, 0.34)",
  },
  message: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 72,
    minHeight: 44,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: "rgba(177, 62, 77, 0.94)",
  },
  messageText: { color: palette.white, textAlign: "center", fontWeight: "800" },
});
