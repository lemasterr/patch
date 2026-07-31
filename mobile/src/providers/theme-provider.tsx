import Storage from "expo-sqlite/kv-store";
import * as SystemUI from "expo-system-ui";
import { Appearance, useColorScheme } from "react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
const themeStorageKey = (userId: string) => `patch:theme-preference:${userId}`;

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function PatchThemeProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const systemTheme = useColorScheme();
  const ownerId = session?.user.id ?? null;
  const [themeState, setThemeState] = useState<{
    ownerId: string | null;
    preference: ThemePreference;
  }>({ ownerId: null, preference: "system" });
  const preference =
    themeState.ownerId === ownerId ? themeState.preference : "system";
  const activeOwnerId = useRef<string | null>(null);
  const themeRequest = useRef(0);
  const preferenceVersion = useRef(0);
  const resolved = resolveThemePreference(preference, systemTheme);
  const colors = resolved === "light" ? lightPalette : darkPalette;

  useEffect(() => {
    const request = ++themeRequest.current;
    activeOwnerId.current = ownerId;
    const loadVersion = ++preferenceVersion.current;
    if (!ownerId) return;
    const userId = ownerId;

    async function loadTheme() {
      const storageKey = themeStorageKey(userId);
      const stored = await Storage.getItem(storageKey).catch(() => null);
      if (
        themeRequest.current !== request ||
        activeOwnerId.current !== userId ||
        preferenceVersion.current !== loadVersion
      )
        return;
      if (isThemePreference(stored)) {
        Appearance.setColorScheme(stored === "system" ? "unspecified" : stored);
        setThemeState({ ownerId: userId, preference: stored });
      }

      const { data } = await supabase
        .from("user_settings")
        .select("theme")
        .eq("user_id", userId)
        .maybeSingle();
      if (
        themeRequest.current !== request ||
        activeOwnerId.current !== userId ||
        preferenceVersion.current !== loadVersion ||
        !data
      )
        return;
      Appearance.setColorScheme(
        data.theme === "system" ? "unspecified" : data.theme,
      );
      setThemeState({ ownerId: userId, preference: data.theme });
      await Storage.setItem(storageKey, data.theme);
    }

    void loadTheme();
  }, [ownerId]);

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
      const currentOwnerId = session?.user.id ?? null;
      const previous = preference;
      const version = ++preferenceVersion.current;
      Appearance.setColorScheme(next === "system" ? "unspecified" : next);
      setThemeState({ ownerId: currentOwnerId, preference: next });
      if (!currentOwnerId) return;
      const storageKey = themeStorageKey(currentOwnerId);
      await Storage.setItem(storageKey, next);
      if (activeOwnerId.current !== currentOwnerId) return;
      const { error } = await supabase
        .from("user_settings")
        .update({ theme: next })
        .eq("user_id", currentOwnerId);
      if (
        error &&
        activeOwnerId.current === currentOwnerId &&
        preferenceVersion.current === version
      ) {
        setThemeState({ ownerId: currentOwnerId, preference: previous });
        await Storage.setItem(storageKey, previous);
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
