import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
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
import { AppState } from "react-native";

import {
  clearPendingPushDisable,
  clearRegisteredPushToken,
  getRegisteredPushDevice,
  recordPendingPushDisable,
} from "@/lib/push-token";
import { getDeviceTimeZone } from "@/lib/device-time-zone";
import {
  authLinkMessage,
  isPatchAuthCallback,
  parseAuthLink,
} from "@/lib/auth-link";
import { supabase, supabaseConfigurationError } from "@/lib/supabase";
import type { Profile } from "@/types/domain";

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileLoadError: string | null;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  completeOnboarding: (input: {
    username: string;
    displayName: string;
  }) => Promise<string | null>;
  signOut: () => Promise<void>;
  recoveryActive: boolean;
  authLinkError: string | null;
  clearRecovery: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function settleWithin<T>(promise: PromiseLike<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T | null>([
      Promise.resolve(promise),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(!supabaseConfigurationError);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [recoveryActive, setRecoveryActive] = useState(false);
  const [authLinkError, setAuthLinkError] = useState<string | null>(null);
  const profileRequest = useRef(0);
  const authRequest = useRef(0);
  const timeZoneRequest = useRef(0);
  const processedAuthLinks = useRef(new Set<string>());

  const loadProfile = useCallback(async (userId?: string) => {
    const request = ++profileRequest.current;
    if (!userId) {
      setProfile(null);
      setProfileLoadError(null);
      return;
    }
    // A session change must never render data from the previous account while
    // a profile request for the new account is in flight.
    setProfile(null);
    setProfileLoadError(null);
    const { data, error } = await supabase.rpc("get_current_profile_summary");
    if (request !== profileRequest.current) return;
    if (error) {
      setProfile(null);
      setProfileLoadError(
        "Could not load your profile. Check your connection and try again.",
      );
      return;
    }
    setProfileLoadError(null);
    setProfile((data?.[0] as Profile | undefined) ?? null);
  }, []);

  useEffect(() => {
    if (supabaseConfigurationError) return;

    const initialization = ++authRequest.current;
    void (async () => {
      try {
        const restored = await settleWithin(supabase.auth.getSession(), 5_000);
        if (initialization !== authRequest.current) return;
        if (!restored || restored.error) {
          setSession(null);
          setProfile(null);
          setProfileLoadError(
            "Could not restore your session. Check your connection and try again.",
          );
          return;
        }
        setSession(restored.data.session);
        await loadProfile(restored.data.session?.user.id);
      } catch {
        if (initialization !== authRequest.current) return;
        setSession(null);
        setProfile(null);
        setProfileLoadError(
          "Could not restore your session. Check your connection and try again.",
        );
      } finally {
        if (initialization === authRequest.current) setLoading(false);
      }
    })();
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authRequest.current += 1;
      if (event === "PASSWORD_RECOVERY") setRecoveryActive(true);
      setSession(nextSession);
      setLoading(true);
      void loadProfile(nextSession?.user.id).finally(() => setLoading(false));
    });
    return () => data.subscription.unsubscribe();
  }, [loadProfile]);

  useEffect(() => {
    const ownerId = session?.user.id;
    const profileId = profile?.id;
    const savedTimeZone = profile?.time_zone;
    if (!ownerId || profileId !== ownerId) return;
    let active = true;

    function syncTimeZone() {
      const timeZone = getDeviceTimeZone();
      if (timeZone === savedTimeZone) return;
      const request = ++timeZoneRequest.current;
      void Promise.resolve(
        supabase.rpc("set_user_time_zone", { p_time_zone: timeZone }),
      )
        .then(({ data, error }) => {
          if (!active || error || !data || request !== timeZoneRequest.current)
            return;
          setProfile((current) => {
            if (!current || current.id !== ownerId) return current;
            return { ...current, time_zone: data };
          });
        })
        .catch(() => undefined);
    }

    syncTimeZone();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") syncTimeZone();
    });
    return () => {
      active = false;
      timeZoneRequest.current += 1;
      subscription.remove();
    };
  }, [profile?.id, profile?.time_zone, session?.user.id]);

  useEffect(() => {
    if (supabaseConfigurationError) return;

    async function handleAuthUrl(url: string | null) {
      // Expo Linking emits every app deep link. Only the explicit callback
      // route is an auth credential, so navigation links cannot create a
      // misleading recovery-link error.
      if (!url || !isPatchAuthCallback(url)) return;
      if (processedAuthLinks.current.has(url)) return;
      processedAuthLinks.current.add(url);
      const parsed = parseAuthLink(url);
      if (parsed.error) {
        setAuthLinkError(authLinkMessage(parsed.error));
        return;
      }
      setAuthLinkError(null);
      if (parsed.intent === "recovery") setRecoveryActive(true);
      if (parsed.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          parsed.code,
        );
        if (error) setAuthLinkError(authLinkMessage(error.message));
      } else if (parsed.accessToken && parsed.refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: parsed.accessToken,
          refresh_token: parsed.refreshToken,
        });
        if (error) setAuthLinkError(authLinkMessage(error.message));
      } else {
        setAuthLinkError("This link is incomplete. Request a new one.");
      }
    }

    void Linking.getInitialURL().then(handleAuthUrl);
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleAuthUrl(url);
    });
    return () => subscription.remove();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      profileLoadError,
      recoveryActive,
      authLinkError,
      clearRecovery: () => {
        setRecoveryActive(false);
        setAuthLinkError(null);
      },
      refreshProfile: () => loadProfile(session?.user.id),
      signIn: async (email, password) => {
        if (supabaseConfigurationError) return supabaseConfigurationError;
        setLoading(true);
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          setLoading(false);
          return "Email or password is incorrect.";
        }
        await loadProfile(data.session.user.id);
        setLoading(false);
        return null;
      },
      signUp: async (email, password) => {
        if (supabaseConfigurationError) return supabaseConfigurationError;
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: "patch://auth/callback" },
        });
        return error ? error.message : null;
      },
      completeOnboarding: async ({ username, displayName }) => {
        if (!session) return "Sign in again to finish your profile.";
        const normalizedUsername = username.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,24}$/.test(normalizedUsername)) {
          return "Use 3–24 letters, numbers, or underscores.";
        }
        if (!displayName.trim()) return "Add a display name.";

        const { error } = await supabase.rpc("complete_onboarding_v2", {
          p_username: normalizedUsername,
          p_display_name: displayName.trim(),
        });
        if (error) {
          return error.code === "P0001" && error.message === "username_taken"
            ? "That username is already taken."
            : "We could not create your profile.";
        }
        await Promise.resolve(
          supabase.rpc("set_user_time_zone", {
            p_time_zone: getDeviceTimeZone(),
          }),
        ).catch(() => undefined);
        await loadProfile(session.user.id);
        return null;
      },
      signOut: async () => {
        // The authenticated RPC must begin before the session is cleared. A
        // durable tombstone lets the next registration atomically retire this
        // installation if the device is offline or the app is force-closed.
        const ownerId = session?.user.id;
        const device = await getRegisteredPushDevice();
        if (device && device.ownerId === ownerId) {
          await recordPendingPushDisable({
            ownerId: device.ownerId,
            installationId: device.installationId,
          });
          try {
            const result = await settleWithin(
              supabase.rpc("disable_push_installation", {
                p_installation_id: device.installationId,
              }),
              2_500,
            );
            if (result && !result.error) {
              await Promise.all([
                clearPendingPushDisable(),
                clearRegisteredPushToken(),
              ]);
            }
          } catch {
            console.warn("Could not disable the push device during sign out.");
          }
        }

        authRequest.current += 1;
        profileRequest.current += 1;
        setSession(null);
        setProfile(null);
        setProfileLoadError(null);
        setRecoveryActive(false);
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error)
          console.warn("Could not clear the local session during sign out.");
      },
    }),
    [
      authLinkError,
      loading,
      loadProfile,
      profile,
      profileLoadError,
      recoveryActive,
      session,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
