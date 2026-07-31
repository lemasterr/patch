import type { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";

import { spacing } from "@/constants/theme";
import { useTheme } from "@/providers/theme-provider";

export function SettingsGroup({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.group,
        { borderColor: colors.border, backgroundColor: colors.surface },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    paddingLeft: spacing.md,
  },
});
