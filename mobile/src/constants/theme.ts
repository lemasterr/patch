import { DynamicColorIOS, Platform } from "react-native";

export type SemanticPalette = {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceElevated: string;
  ink: string;
  inkMuted: string;
  blue: string;
  blueBright: string;
  navy: string;
  border: string;
  glassLight: string;
  glassDark: string;
  white: string;
  red: string;
  gold: string;
  green: string;
  teal: string;
  lilac: string;
  overlay: string;
};

export const darkPalette: SemanticPalette = {
  background: "#08131E",
  surface: "#102434",
  surfaceMuted: "#173449",
  surfaceElevated: "#1B3A50",
  ink: "#F1F7FC",
  inkMuted: "#9BB1C3",
  blue: "#75ACE9",
  blueBright: "#9BC8F1",
  navy: "#06111A",
  border: "rgba(174, 205, 231, 0.2)",
  glassLight: "rgba(18, 40, 57, 0.76)",
  glassDark: "rgba(7, 20, 31, 0.78)",
  white: "#FFFFFF",
  red: "#D45165",
  gold: "#F4B94E",
  green: "#4A8F82",
  teal: "#3C7E9E",
  lilac: "#826FB6",
  overlay: "rgba(0, 0, 0, 0.56)",
};

export const lightPalette: SemanticPalette = {
  background: "#F7FAFC",
  surface: "#FFFFFF",
  surfaceMuted: "#EAF1F6",
  surfaceElevated: "#FFFFFF",
  ink: "#102434",
  inkMuted: "#5B7181",
  blue: "#2D6EAB",
  blueBright: "#4A7DB7",
  navy: "#EAF1F6",
  border: "rgba(26, 67, 91, 0.18)",
  glassLight: "rgba(255, 255, 255, 0.82)",
  glassDark: "rgba(234, 241, 246, 0.84)",
  white: "#FFFFFF",
  red: "#B93B55",
  gold: "#9A6800",
  green: "#226B5E",
  teal: "#2A6B88",
  lilac: "#69519D",
  overlay: "rgba(10, 29, 42, 0.36)",
};

/**
 * Most existing visual components read this palette while their StyleSheet is
 * created. On iOS, DynamicColorIOS keeps those values responsive instead of
 * freezing the old dark tokens when a person selects the light theme. Android
 * views already receive the resolved palette through the migrated screen and
 * navigation surfaces; legacy values retain a safe dark fallback there.
 */
function adaptiveColor(light: string, dark: string): string {
  if (Platform.OS !== "ios") return dark;
  return DynamicColorIOS({ light, dark }) as unknown as string;
}

export const palette: SemanticPalette = Object.fromEntries(
  (Object.keys(darkPalette) as (keyof SemanticPalette)[]).map((key) => [
    key,
    adaptiveColor(lightPalette[key], darkPalette[key]),
  ]),
) as SemanticPalette;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 36,
} as const;

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 30,
  pill: 999,
} as const;

export const type = {
  regular: Platform.select({ ios: "SF Pro Text", default: "sans-serif" }),
  rounded: Platform.select({ ios: "SF Pro Rounded", default: "sans-serif" }),
  mono: Platform.select({ ios: "SF Mono", default: "monospace" }),
} as const;

export const shadow = {
  shadowColor: "#153453",
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.14,
  shadowRadius: 24,
  elevation: 9,
} as const;

export const categoryLabels = {
  adventure: "Adventure",
  travel: "Travel",
  personal: "Personal",
  social: "Social",
  creativity: "Creativity",
  learning: "Learning",
  health: "Health",
  work: "Work",
  everyday: "Everyday",
  funny: "Funny",
  other: "Other",
} as const;

export const rarityLabels = {
  common: "Common",
  rare: "Rare",
  legendary: "Legendary",
} as const;
