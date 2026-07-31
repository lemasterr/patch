import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { palette, radius, spacing, type } from "@/constants/theme";
import { clearRegisteredPushToken } from "@/lib/push-token";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

export default function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  function confirm() {
    Alert.alert(
      "Delete account permanently?",
      "Your Patches, friendships, settings, and push devices will be deleted. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () => void remove(),
        },
      ],
    );
  }
  async function remove() {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke<{
      deleted?: boolean;
    }>("delete-account", {
      body: { confirmation, password },
    });
    setBusy(false);
    if (error || !data?.deleted) {
      setMessage(
        "We could not delete your account. Check your password and try again.",
      );
      return;
    }
    await clearRegisteredPushToken();
    await signOut();
    router.replace("/auth");
  }
  return (
    <Screen>
      <PatchHeader back title="Delete account" showNotifications={false} />
      <View style={styles.content}>
        <View style={styles.warning}>
          <Text style={styles.title}>This is permanent</Text>
          <Text style={styles.body}>
            Deleting your account removes your Patch profile, Patches, settings,
            friendships, notifications, registered devices, travel history, and
            product analytics. Reports you filed are deleted; reports about your
            content are retained without a profile link.
          </Text>
        </View>
        <View style={styles.confirmationFields}>
          <TextInput
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
            placeholder="Type DELETE"
            placeholderTextColor={palette.inkMuted}
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            placeholder="Current password"
            placeholderTextColor={palette.inkMuted}
            style={styles.input}
          />
        </View>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Pressable
          disabled={busy || confirmation !== "DELETE" || !password}
          onPress={confirm}
          style={[
            styles.button,
            (busy || confirmation !== "DELETE" || !password) && styles.disabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={palette.white} />
          ) : (
            <Text style={styles.buttonText}>Delete account</Text>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { flex: 1, gap: spacing.lg, padding: spacing.lg },
  warning: {
    backgroundColor: `${palette.red}14`,
    borderColor: `${palette.red}44`,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  title: {
    color: palette.red,
    fontFamily: type.rounded,
    fontSize: 24,
    fontWeight: "900",
  },
  body: { color: palette.inkMuted, fontSize: 14, lineHeight: 21 },
  confirmationFields: { gap: spacing.sm },
  input: {
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: palette.ink,
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  message: { color: palette.red, fontSize: 13 },
  button: {
    alignItems: "center",
    backgroundColor: palette.red,
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 50,
  },
  buttonText: { color: palette.white, fontWeight: "900" },
  disabled: { opacity: 0.45 },
});
