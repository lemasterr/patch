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

import {
  clearRegisteredPushToken,
  getRegisteredPushToken,
} from "@/lib/push-token";
import { isPatchAuthCallback, parseAuthLink } from "@/lib/auth-link";
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

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(!supabaseConfigurationError);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [recoveryActive, setRecoveryActive] = useState(false);
  const [authLinkError, setAuthLinkError] = useState<string | null>(null);
  const profileRequest = useRef(0);
  const authRequest = useRef(0);

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
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, username, display_name, bio, avatar_key, onboarding_completed, achievement_count, total_received_likes, friend_count, is_discoverable, map_is_public",
      )
      .eq("id", userId)
      .maybeSingle();
    if (request !== profileRequest.current) return;
    if (error) {
      setProfile(null);
      setProfileLoadError(
        "Could not load your profile. Check your connection and try again.",
      );
      return;
    }
    setProfileLoadError(null);
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    if (supabaseConfigurationError) return;

    const initialization = ++authRequest.current;
    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (initialization !== authRequest.current) return;
      if (error) {
        setSession(null);
        setProfile(null);
        setProfileLoadError(
          "Could not restore your session. Check your connection and try again.",
        );
        setLoading(false);
        return;
      }
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      setLoading(false);
    });
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
    if (supabaseConfigurationError) return;

    async function handleAuthUrl(url: string | null) {
      // Expo Linking emits every app deep link. Only the explicit callback
      // route is an auth credential, so navigation links cannot create a
      // misleading recovery-link error.
      if (!url || !isPatchAuthCallback(url)) return;
      const parsed = parseAuthLink(url);
      if (parsed.error) {
        setAuthLinkError(parsed.error);
        return;
      }
      if (parsed.intent === "recovery") setRecoveryActive(true);
      if (parsed.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          parsed.code,
        );
        if (error) setAuthLinkError(error.message);
      } else if (parsed.accessToken && parsed.refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: parsed.accessToken,
          refresh_token: parsed.refreshToken,
        });
        if (error) setAuthLinkError(error.message);
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

        const { error } = await supabase.rpc("complete_onboarding_v1", {
          p_username: normalizedUsername,
          p_display_name: displayName.trim(),
        });
        if (error) {
          return error.code === "P0001" && error.message === "username_taken"
            ? "That username is already taken."
            : "We could not create your profile.";
        }
        await loadProfile(session.user.id);
        return null;
      },
      signOut: async () => {
        // Start the authenticated cleanup before clearing the local session,
        // but never let connectivity hold the device in the account.
        void (async () => {
          try {
            const pushToken = await getRegisteredPushToken();
            if (!pushToken) return;
            const { error } = await supabase.rpc("disable_push_device", {
              p_expo_push_token: pushToken,
            });
            if (error) {
              console.warn(
                "Could not disable the push device during sign out.",
              );
              return;
            }
            await clearRegisteredPushToken();
          } catch {
            console.warn("Could not disable the push device during sign out.");
          }
        })();

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
