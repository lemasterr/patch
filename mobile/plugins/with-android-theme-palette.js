const {
  AndroidConfig,
  withAndroidColors,
  withAndroidColorsNight,
} = require("expo/config-plugins");

// Keep these values in sync with src/constants/theme.ts. Legacy StyleSheets
// use PlatformColor resources, so Android resolves the correct semantic token
// even where a component does not need to subscribe to React theme context.
const lightPalette = {
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

const darkPalette = {
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

function resourceName(token) {
  return `patch_palette_${token.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`;
}

function androidColor(value) {
  const rgba = value.match(
    /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/,
  );
  if (!rgba) return value;

  const [, red, green, blue, alpha] = rgba;
  const opacity = Math.round(Number(alpha) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${opacity}${Number(red).toString(16).padStart(2, "0")}${Number(green).toString(16).padStart(2, "0")}${Number(blue).toString(16).padStart(2, "0")}`;
}

function withPaletteColors(colors) {
  return (modConfig) => {
    for (const [token, value] of Object.entries(colors)) {
      modConfig.modResults = AndroidConfig.Colors.assignColorValue(
        modConfig.modResults,
        { name: resourceName(token), value: androidColor(value) },
      );
    }
    return modConfig;
  };
}

module.exports = function withAndroidThemePalette(config) {
  config = withAndroidColors(config, withPaletteColors(lightPalette));
  return withAndroidColorsNight(config, withPaletteColors(darkPalette));
};
