import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  countableCountryCodes,
  countryFlag,
  countryPickerRegions,
  statusMeta,
  WORLD_COUNTRY_TOTAL,
} from "@/features/travel/country-catalog";
import type { TravelVisit } from "@/features/travel/types";
import {
  worldCountries,
  type WorldLocation,
} from "@/features/travel/world-map";
import { palette, radius, spacing, type } from "@/constants/theme";

export function CountryPicker({
  visible,
  visits,
  onChoose,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  visits: TravelVisit[];
  onChoose: (country: WorldLocation) => void;
  onClose: () => void;
  onDismiss?: () => void;
}) {
  const [query, setQuery] = useState("");
  const visitByCode = useMemo(
    () => new Map(visits.map((visit) => [visit.country_code, visit])),
    [visits],
  );
  const sections = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matchingCountries = worldCountries
      .filter(
        (country) =>
          country.name.toLowerCase().includes(normalized) ||
          country.id.toLowerCase().includes(normalized),
      )
      .sort((left, right) => left.name.localeCompare(right.name));
    const assignedCodes = new Set<string>();
    const grouped = countryPickerRegions.flatMap((region) => {
      const regionCodes = new Set(
        region.codes
          .split(" ")
          .filter((code) => countableCountryCodes.has(code)),
      );
      const data = matchingCountries.filter((country) => {
        const matches = regionCodes.has(country.id.toUpperCase());
        if (matches) assignedCodes.add(country.id.toUpperCase());
        return matches;
      });
      return data.length ? [{ title: region.label, data }] : [];
    });
    const remaining = matchingCountries.filter(
      (country) => !assignedCodes.has(country.id.toUpperCase()),
    );
    // The canonical selectable array is fully represented by the regional
    // groups. Keep an `Other` fallback only for a future catalogue change;
    // territories must not become extra rows in the 195-country picker.
    return remaining.length
      ? [...grouped, { title: "Other", data: remaining }]
      : grouped;
  }, [query]);

  function choose(country: WorldLocation) {
    setQuery("");
    onChoose(country);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.root}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>
              Choose a country · {WORLD_COUNTRY_TOTAL}
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
        <View style={styles.search}>
          <MaterialCommunityIcons
            name="magnify"
            size={20}
            color={palette.inkMuted}
          />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search countries"
            placeholderTextColor={palette.inkMuted}
            style={styles.searchInput}
          />
        </View>
        <SectionList
          sections={sections}
          keyExtractor={(country) => country.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No countries match that search.</Text>
          }
          renderItem={({ item }) => {
            const visit = visitByCode.get(item.id.toUpperCase());
            return (
              <Pressable
                onPress={() => choose(item)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Text style={styles.flag}>{countryFlag(item.id)}</Text>
                <Text style={styles.countryName}>{item.name}</Text>
                {visit ? (
                  <Text
                    style={[
                      styles.status,
                      { color: statusMeta[visit.status].color },
                    ]}
                  >
                    {statusMeta[visit.status].label}
                  </Text>
                ) : null}
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={palette.inkMuted}
                />
              </Pressable>
            );
          }}
        />
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
  search: {
    height: 48,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  searchInput: { flex: 1, color: palette.ink, fontSize: 14 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  sectionTitle: {
    marginTop: spacing.md,
    paddingBottom: spacing.xs,
    color: palette.blueBright,
    fontFamily: type.rounded,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.35,
  },
  row: {
    minHeight: 57,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  flag: { width: 30, fontSize: 23, textAlign: "center" },
  countryName: { flex: 1, color: palette.ink, fontSize: 14, fontWeight: "700" },
  status: { fontSize: 10, fontWeight: "800" },
  empty: {
    paddingVertical: spacing.xl,
    color: palette.inkMuted,
    fontSize: 13,
    textAlign: "center",
  },
  pressed: { opacity: 0.56 },
});
