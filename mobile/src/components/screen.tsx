import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { type PropsWithChildren } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/providers/theme-provider";

type ScreenProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  edges?: ("top" | "right" | "bottom" | "left")[];
  dark?: boolean;
}>;

export function Screen({
  children,
  style,
  edges = ["top", "left", "right"],
  dark = false,
}: ScreenProps) {
  const { colors, resolved } = useTheme();
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: dark ? colors.navy : colors.background },
      ]}
    >
      <LinearGradient
        colors={
          dark
            ? [colors.navy, colors.navy, colors.navy]
            : [colors.surface, colors.background, colors.navy]
        }
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <SafeAreaView edges={edges} style={[styles.safe, style]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
});
