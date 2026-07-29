import { Link, Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/screen";
import { palette, spacing } from "@/constants/theme";
import { authLinkMessage } from "@/lib/auth-link";
import { useAuth } from "@/providers/auth-provider";

export default function AuthCallbackScreen() {
  const { session, loading, recoveryActive, authLinkError } = useAuth();
  if (!loading && recoveryActive && session)
    return <Redirect href="/reset-password" />;
  if (!loading && session) return <Redirect href="/" />;
  if (!loading && authLinkError) {
    return (
      <Screen edges={["top", "bottom", "left", "right"]}>
        <View style={styles.root}>
          <Text style={styles.copy}>{authLinkMessage(authLinkError)}</Text>
          <Link href="/forgot-password" style={styles.link}>
            Request a recovery link
          </Link>
          <Link href="/auth" style={styles.link}>
            Return to sign in
          </Link>
        </View>
      </Screen>
    );
  }
  if (!loading && !session) return <Redirect href="/auth" />;
  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View style={styles.root}>
        <ActivityIndicator size="large" color={palette.blue} />
        <Text style={styles.copy}>Finishing sign in…</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  copy: { color: palette.inkMuted, fontSize: 14 },
  link: { color: palette.blue, fontSize: 14, fontWeight: "800" },
});
