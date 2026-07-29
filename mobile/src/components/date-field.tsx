import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { palette, radius, spacing } from "@/constants/theme";

type DateFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maximumDate?: string;
  minimumDate?: string;
  disabled?: boolean;
  accessibilityHint?: string;
};

function dateFromIso(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayDateOnly() {
  return formatDateOnly(new Date());
}

export function DateField({
  label,
  value,
  onChange,
  maximumDate,
  minimumDate,
  disabled = false,
  accessibilityHint,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = dateFromIso(value);

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityHint={
          accessibilityHint ?? "Opens the native wheel date picker."
        }
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.button,
          pressed && !disabled && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.calendar}>⌄</Text>
      </Pressable>
      {open ? (
        <View style={styles.pickerPanel}>
          <DateTimePicker
            value={selectedDate}
            mode="date"
            // Expo SDK 57 maps this to the native iOS wheel picker; Android
            // intentionally uses its platform dialog because Material 3 has no
            // wheel-style date control.
            display={Platform.OS === "ios" ? "spinner" : "default"}
            presentation={Platform.OS === "android" ? "dialog" : "inline"}
            maximumDate={maximumDate ? dateFromIso(maximumDate) : undefined}
            minimumDate={minimumDate ? dateFromIso(minimumDate) : undefined}
            onDismiss={() => setOpen(false)}
            onValueChange={(_, nextDate) => {
              onChange(formatDateOnly(nextDate));
              if (Platform.OS === "android") setOpen(false);
            }}
          />
          {Platform.OS === "ios" ? (
            <Pressable
              accessibilityLabel={`Done choosing ${label}`}
              onPress={() => setOpen(false)}
              style={styles.done}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  label: { color: palette.inkMuted, fontSize: 12, fontWeight: "800" },
  button: {
    minHeight: 48,
    borderBottomWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
  },
  value: { color: palette.ink, fontSize: 15, fontWeight: "700" },
  calendar: { color: palette.inkMuted, fontSize: 18 },
  pressed: { backgroundColor: palette.surfaceMuted, borderRadius: radius.sm },
  disabled: { opacity: 0.55 },
  pickerPanel: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  done: {
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    justifyContent: "center",
    minHeight: 46,
  },
  doneText: { color: palette.blue, fontSize: 15, fontWeight: "900" },
});
