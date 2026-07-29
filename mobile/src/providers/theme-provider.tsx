import Storage from "expo-sqlite/kv-store";
import * as SystemUI from "expo-system-ui";
import { Appearance, useColorScheme } from "react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import {
  darkPalette,
  lightPalette,
  type SemanticPalette,
} from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { resolveThemePreference, type ThemePreference } from "@/lib/theme";
import { useAuth } from "@/providers/auth-provider";

export type { ThemePreference } from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: "light" | "dark";
  colors: SemanticPalette;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const localThemeKey = "patch:theme-preference";

export function PatchThemeProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const systemTheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const resolved = resolveThemePreference(preference, systemTheme);
  const colors = resolved === "light" ? lightPalette : darkPalette;

  useEffect(() => {
    void Storage.getItem(localThemeKey).then((stored) => {
      if (stored === "system" || stored === "light" || stored === "dark") {
        setPreferenceState(stored);
      }
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    void supabase
      .from("user_settings")
      .select("theme")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setPreferenceState(data.theme);
        void Storage.setItem(localThemeKey, data.theme);
      });
  }, [session]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  useEffect(() => {
    // This also drives DynamicColorIOS tokens used by legacy StyleSheets, so
    // every existing screen follows the selected appearance without a reload.
    Appearance.setColorScheme(
      preference === "system" ? "unspecified" : preference,
    );
  }, [preference]);

  const setPreference = useCallback(
    async (next: ThemePreference) => {
      const previous = preference;
      setPreferenceState(next);
      await Storage.setItem(localThemeKey, next);
      if (!session) return;
      const { error } = await supabase
        .from("user_settings")
        .update({ theme: next })
        .eq("user_id", session.user.id);
      if (error) {
        setPreferenceState(previous);
        await Storage.setItem(localThemeKey, previous);
        throw error;
      }
    },
    [preference, session],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, colors, setPreference }),
    [colors, preference, resolved, setPreference],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context)
    throw new Error("useTheme must be used inside PatchThemeProvider.");
  return context;
}
