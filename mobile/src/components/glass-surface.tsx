import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { type PropsWithChildren } from "react";
import { BlurView } from "expo-blur";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { palette } from "@/constants/theme";

type GlassSurfaceProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  dark?: boolean;
  effect?: "clear" | "regular" | "none";
  tintColor?: string;
}>;

export function GlassSurface({
  children,
  style,
  interactive = false,
  dark = true,
  effect = "regular",
  tintColor,
}: GlassSurfaceProps) {
  if (Platform.OS === "ios" && isGlassEffectAPIAvailable()) {
    return (
      <GlassView
        glassEffectStyle={effect}
        isInteractive={interactive}
        colorScheme={dark ? "dark" : "light"}
        // A clear native material must not receive our dark surface tint. That
        // tint turns Liquid Glass into an opaque-looking panel, particularly
        // when it is used as floating navigation chrome.
        tintColor={
          tintColor ??
          (effect === "clear"
            ? undefined
            : dark
              ? palette.glassDark
              : palette.glassLight)
        }
        style={[styles.base, style]}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      intensity={Platform.OS === "android" ? 54 : 72}
      tint={dark ? "dark" : "light"}
      blurMethod={
        Platform.OS === "android" ? "dimezisBlurViewSdk31Plus" : undefined
      }
      style={[styles.base, dark ? styles.dark : styles.light, style]}
    >
      {children}
    </BlurView>
  );
}

export function GlassFallback({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.base, styles.light, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(155, 200, 241, 0.16)",
  },
  light: { backgroundColor: palette.glassLight },
  dark: { backgroundColor: palette.glassDark },
});
