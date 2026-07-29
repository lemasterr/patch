import { Picker } from "@expo/ui/community/picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { palette, radius, spacing, type } from "@/constants/theme";
import { monthLabels } from "@/features/travel/country-catalog";

export function MonthYearPicker({
  visible,
  month,
  year,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  month: number | null;
  year: number | null;
  onConfirm: (value: { month: number | null; year: number | null }) => void;
  onClose: () => void;
}) {
  const years = useMemo(
    () =>
      Array.from(
        { length: new Date().getFullYear() - 1899 },
        (_, index) => new Date().getFullYear() + 1 - index,
      ),
    [],
  );
  const [draftMonth, setDraftMonth] = useState<number>(month ?? 1);
  const [draftYear, setDraftYear] = useState<number>(year ?? years[0]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityLabel="Close date picker"
          onPress={onClose}
          style={styles.backdrop}
        />
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>When was it?</Text>
              <Text style={styles.subtitle}>
                Turn the wheels to select the month and year.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close date picker"
              onPress={onClose}
              style={styles.close}
            >
              <MaterialCommunityIcons
                name="close"
                size={20}
                color={palette.ink}
              />
            </Pressable>
          </View>
          <View style={styles.pickers}>
            <PickerColumn title="Month">
              <Picker
                selectedValue={draftMonth}
                onValueChange={(value) => setDraftMonth(Number(value))}
              >
                {monthLabels.map((label, index) => (
                  <Picker.Item key={label} label={label} value={index + 1} />
                ))}
              </Picker>
            </PickerColumn>
            <PickerColumn title="Year">
              <Picker
                selectedValue={draftYear}
                onValueChange={(value) => setDraftYear(Number(value))}
              >
                {years.map((value) => (
                  <Picker.Item
                    key={value}
                    label={String(value)}
                    value={value}
                  />
                ))}
              </Picker>
            </PickerColumn>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                onConfirm({ month: null, year: null });
                onClose();
              }}
              style={styles.clear}
            >
              <Text style={styles.clearText}>No date</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onConfirm({ month: draftMonth, year: draftYear });
                onClose();
              }}
              style={styles.confirm}
            >
              <Text style={styles.confirmText}>Save date</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function PickerColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.column}>
      <Text style={styles.columnTitle}>{title}</Text>
      <View style={styles.wheel}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(2, 12, 20, 0.48)",
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    backgroundColor: palette.border,
    borderRadius: radius.pill,
    height: 5,
    marginTop: spacing.xs,
    width: 42,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 20,
    fontWeight: "900",
  },
  subtitle: {
    color: palette.inkMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3,
  },
  close: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  pickers: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  column: { flex: 1 },
  columnTitle: {
    color: palette.inkMuted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
    paddingBottom: 6,
    textTransform: "uppercase",
  },
  wheel: {
    backgroundColor: palette.background,
    borderRadius: radius.md,
    height: 180,
    justifyContent: "center",
    overflow: "hidden",
  },
  actions: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg },
  clear: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  clearText: { color: palette.ink, fontSize: 13, fontWeight: "900" },
  confirm: {
    alignItems: "center",
    backgroundColor: palette.blue,
    borderRadius: radius.md,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  confirmText: { color: palette.white, fontSize: 13, fontWeight: "900" },
});
