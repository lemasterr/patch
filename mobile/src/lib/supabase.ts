import "react-native-url-polyfill/auto";

import { createClient, processLock } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

import { secureStorage } from "@/lib/secure-storage";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabaseConfigurationError =
  !supabaseUrl || !supabasePublishableKey
    ? "Patch is not connected to a backend. For local development, restart with `npm run mobile:ios:local` (or `mobile:android:local`). For a hosted build, add the two EXPO_PUBLIC_SUPABASE values to mobile/.env and restart Metro."
    : null;

if (supabaseConfigurationError) {
  console.warn(supabaseConfigurationError);
}

export const supabase = createClient<Database>(
  // This inert endpoint is never used while configuration is missing. It avoids
  // accidentally talking to another local Supabase project on the legacy port.
  supabaseUrl ?? "http://127.0.0.1:1",
  supabasePublishableKey ?? "missing-local-publishable-key",
  {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  },
);

if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
