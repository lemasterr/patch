import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AnimatedMascot } from "@/components/animated-mascot";
import { palette } from "@/constants/theme";
import { useAuth } from "@/providers/auth-provider";

export default function EntryScreen() {
  const { session, profile, loading, profileLoadError, refreshProfile } =
    useAuth();
  const [launchReady, setLaunchReady] = useState(false);

  useEffect(() => {
    // A short perceptual handoff keeps the native greeting and its React
    // counterpart contiguous; it is not a second launch blocker.
    const timer = setTimeout(() => setLaunchReady(true), 220);
    return () => clearTimeout(timer);
  }, []);

  if (loading || !launchReady) {
    return (
      <View style={styles.loading}>
        <AnimatedMascot size={220} variant="welcome" />
        <Text style={styles.loadingText}>Patch is getting ready…</Text>
      </View>
    );
  }
  if (!session) return <Redirect href="/auth" />;
  if (profileLoadError) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>{profileLoadError}</Text>
        <Pressable onPress={() => void refreshProfile()} style={styles.retry}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
  if (!profile?.onboarding_completed) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)/discover" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: -16,
    color: palette.inkMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  errorText: { color: palette.ink, fontSize: 14, textAlign: "center" },
  retry: {
    alignItems: "center",
    backgroundColor: palette.blue,
    borderRadius: 22,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 44,
    paddingHorizontal: 20,
  },
  retryText: { color: palette.white, fontWeight: "800" },
});
