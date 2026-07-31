/* eslint-disable react-hooks/set-state-in-effect -- The reusable modal resets its draft form only when a different country is presented. */
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { BlurView } from "expo-blur";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  countryFlag,
  monthLabels,
  statusMeta,
} from "@/features/travel/country-catalog";
import { MonthYearPicker } from "@/features/travel/month-year-picker";
import type { TravelVisit, VisitStatus } from "@/features/travel/types";
import type { WorldLocation } from "@/features/travel/world-map";
import { palette, radius, spacing, type } from "@/constants/theme";

export function CountryEditor({
  country,
  visit,
  saving,
  message,
  onSave,
  onRemove,
  onClose,
  onDismiss,
}: {
  country: WorldLocation | null;
  visit?: TravelVisit;
  saving: boolean;
  message: string | null;
  onSave: (value: {
    status: VisitStatus;
    month: number | null;
    year: number | null;
    note: string;
  }) => void;
  onRemove: () => void;
  onClose: () => void;
  onDismiss?: () => void;
}) {
  const [status, setStatus] = useState<VisitStatus>(visit?.status ?? "visited");
  const [month, setMonth] = useState<number | null>(visit?.visit_month ?? null);
  const [year, setYear] = useState<number | null>(visit?.visit_year ?? null);
  const [note, setNote] = useState(visit?.note ?? "");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!country) return;
    setStatus(visit?.status ?? "visited");
    setMonth(visit?.visit_month ?? null);
    setYear(visit?.visit_year ?? null);
    setNote(visit?.note ?? "");
    setDatePickerOpen(false);
    setLocalMessage(null);
  }, [
    country,
    visit?.note,
    visit?.status,
    visit?.visit_month,
    visit?.visit_year,
  ]);

  function save() {
    if ((month === null) !== (year === null)) {
      setLocalMessage("Choose both month and year, or leave the date empty.");
      return;
    }
    setLocalMessage(null);
    onSave({ status, month, year, note });
  }

  return (
    <Modal
      visible={Boolean(country)}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityLabel="Close country editor"
          onPress={onClose}
          style={styles.backdrop}
        >
          <BlurView
            intensity={26}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        </Pressable>
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <View style={styles.header}>
              <View style={styles.identity}>
                <Text style={styles.flag}>
                  {country ? countryFlag(country.id) : ""}
                </Text>
                <View style={styles.titleCopy}>
                  <Text numberOfLines={1} style={styles.title}>
                    {country?.name}
                  </Text>
                </View>
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

            <Text style={styles.label}>Status</Text>
            <View style={styles.statusRow}>
              {(Object.keys(statusMeta) as VisitStatus[]).map((nextStatus) => {
                const active = nextStatus === status;
                const meta = statusMeta[nextStatus];
                return (
                  <Pressable
                    key={nextStatus}
                    onPress={() => setStatus(nextStatus)}
                    style={[
                      styles.statusButton,
                      {
                        backgroundColor: active
                          ? meta.color
                          : palette.surfaceMuted,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={meta.icon}
                      size={16}
                      color={active ? palette.white : meta.color}
                    />
                    <Text
                      style={[
                        styles.statusText,
                        { color: active ? palette.white : palette.ink },
                      ]}
                    >
                      {meta.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>Date</Text>
            <Pressable
              accessibilityLabel="Choose visit month and year"
              onPress={() => setDatePickerOpen(true)}
              style={styles.dateButton}
            >
              <View>
                <Text style={styles.dateButtonLabel}>Visit date</Text>
                <Text style={styles.dateText}>
                  {month && year
                    ? `${monthLabels[month - 1]} ${year}`
                    : "Add month and year"}
                </Text>
              </View>
              <MaterialCommunityIcons
                name="calendar-month-outline"
                size={20}
                color={palette.blueBright}
              />
            </Pressable>
            {datePickerOpen ? (
              <MonthYearPicker
                visible
                month={month}
                year={year}
                onConfirm={(value) => {
                  setMonth(value.month);
                  setYear(value.year);
                }}
                onClose={() => setDatePickerOpen(false)}
              />
            ) : null}

            <Text style={styles.label}>Note</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={280}
              textAlignVertical="top"
              placeholder="A small memory, plan, or place to return to…"
              placeholderTextColor={palette.inkMuted}
              style={styles.note}
            />
            <Text style={styles.counter}>{note.length}/280</Text>
            {localMessage || message ? (
              <Text style={styles.message}>{localMessage ?? message}</Text>
            ) : null}

            <Pressable
              disabled={saving}
              onPress={save}
              style={[styles.save, saving && styles.disabled]}
            >
              {saving ? (
                <ActivityIndicator color={palette.white} />
              ) : (
                <Text style={styles.saveText}>Save country</Text>
              )}
            </Pressable>
            {visit ? (
              <Pressable
                disabled={saving}
                onPress={onRemove}
                style={styles.remove}
              >
                <Text style={styles.removeText}>Remove status</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill },
  sheet: {
    maxHeight: "82%",
    overflow: "hidden",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: palette.surface,
  },
  handle: {
    width: 42,
    height: 5,
    alignSelf: "center",
    marginTop: spacing.xs,
    marginBottom: 2,
    borderRadius: radius.pill,
    backgroundColor: palette.border,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  header: {
    marginBottom: spacing.sm,
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
  flag: { fontSize: 38 },
  titleCopy: { minWidth: 0, flexShrink: 1 },
  title: {
    flexShrink: 1,
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
  label: {
    marginTop: spacing.sm,
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 13,
    fontWeight: "900",
  },
  optional: {
    color: palette.inkMuted,
    fontFamily: type.regular,
    fontSize: 10,
    fontWeight: "700",
  },
  statusRow: { flexDirection: "row", gap: 6 },
  statusButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  statusText: { fontSize: 9, fontWeight: "900" },
  dateButton: {
    minHeight: 58,
    paddingHorizontal: 13,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateButtonLabel: {
    color: palette.inkMuted,
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  dateText: {
    marginTop: 2,
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  note: {
    height: 122,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    color: palette.ink,
    fontSize: 13,
  },
  counter: { color: palette.inkMuted, fontSize: 9, textAlign: "right" },
  message: { color: palette.red, fontSize: 11, textAlign: "center" },
  save: {
    height: 52,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: palette.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: palette.white, fontSize: 14, fontWeight: "900" },
  remove: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  removeText: { color: palette.red, fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.6 },
});
