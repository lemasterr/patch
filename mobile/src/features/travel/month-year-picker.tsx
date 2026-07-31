import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Picker } from "@expo/ui/community/picker";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radius, spacing, type, type SemanticPalette } from "@/constants/theme";
import { monthLabels } from "@/features/travel/country-catalog";
import { useTheme } from "@/providers/theme-provider";

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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

  if (!visible) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>Visit month and year</Text>
        <Pressable
          accessibilityLabel="Close date picker"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.close}
        >
          <MaterialCommunityIcons name="close" size={20} color={colors.ink} />
        </Pressable>
      </View>
      <View style={styles.pickers}>
        <PickerColumn styles={styles} title="Month">
          <Picker
            selectedValue={draftMonth}
            onValueChange={(value) => setDraftMonth(Number(value))}
          >
            {monthLabels.map((label, index) => (
              <Picker.Item key={label} label={label} value={index + 1} />
            ))}
          </Picker>
        </PickerColumn>
        <PickerColumn styles={styles} title="Year">
          <Picker
            selectedValue={draftYear}
            onValueChange={(value) => setDraftYear(Number(value))}
          >
            {years.map((value) => (
              <Picker.Item key={value} label={String(value)} value={value} />
            ))}
          </Picker>
        </PickerColumn>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Clear visit date"
          accessibilityRole="button"
          onPress={() => {
            onConfirm({ month: null, year: null });
            onClose();
          }}
          style={styles.clear}
        >
          <Text style={styles.clearText}>No date</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Save visit date"
          accessibilityRole="button"
          onPress={() => {
            onConfirm({ month: draftMonth, year: draftYear });
            onClose();
          }}
          style={styles.confirm}
        >
          <Text style={styles.confirmText}>Save date</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PickerColumn({
  title,
  children,
  styles,
}: {
  title: string;
  children: React.ReactNode;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.column}>
      <Text style={styles.columnTitle}>{title}</Text>
      <View style={styles.wheel}>{children}</View>
    </View>
  );
}

function createStyles(colors: SemanticPalette) {
  return StyleSheet.create({
    panel: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      gap: spacing.sm,
      padding: spacing.sm,
    },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    title: {
      color: colors.ink,
      fontFamily: type.rounded,
      fontSize: 15,
      fontWeight: "900",
    },
    close: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    pickers: { flexDirection: "row", gap: spacing.sm },
    column: { flex: 1 },
    columnTitle: {
      color: colors.inkMuted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.6,
      paddingBottom: 6,
      textTransform: "uppercase",
    },
    wheel: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      height: 180,
      justifyContent: "center",
      overflow: "hidden",
    },
    actions: { flexDirection: "row", gap: spacing.sm },
    clear: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      justifyContent: "center",
      minHeight: 50,
      paddingHorizontal: spacing.lg,
    },
    clearText: { color: colors.ink, fontSize: 13, fontWeight: "900" },
    confirm: {
      alignItems: "center",
      backgroundColor: colors.blue,
      borderRadius: radius.md,
      flex: 1,
      justifyContent: "center",
      minHeight: 50,
    },
    confirmText: { color: colors.white, fontSize: 13, fontWeight: "900" },
  });
}
