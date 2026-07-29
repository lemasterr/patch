export type ThemePreference = "system" | "light" | "dark";

export function resolveThemePreference(
  preference: ThemePreference,
  systemTheme: "light" | "dark" | "unspecified" | null | undefined,
) {
  if (preference !== "system") return preference;
  return systemTheme === "light" ? "light" : "dark";
}
