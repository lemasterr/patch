import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { palette, radius, spacing, type } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

function valid(password: string) {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password)
  );
}

export default function ResetPasswordScreen() {
  const { session, clearRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function save() {
    if (!session) {
      setMessage("Your recovery link is no longer active. Request a new one.");
      return;
    }
    if (!valid(password)) {
      setMessage("Use 8+ characters with lowercase, uppercase, and a number.");
      return;
    }
    if (password !== confirm) {
      setMessage("The passwords do not match.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage(
        "This recovery session could not update your password. Request a new link.",
      );
      return;
    }
    clearRecovery();
    router.replace("/");
  }
  return (
    <Screen>
      <PatchHeader back title="Choose a password" showNotifications={false} />
      <View style={styles.content}>
        <Text style={styles.title}>Set a new password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          placeholder="New password"
          placeholderTextColor={palette.inkMuted}
          style={styles.input}
        />
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoComplete="new-password"
          placeholder="Confirm password"
          placeholderTextColor={palette.inkMuted}
          style={styles.input}
        />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Pressable
          disabled={busy}
          onPress={() => void save()}
          style={[styles.button, busy && styles.disabled]}
        >
          {busy ? (
            <ActivityIndicator color={palette.white} />
          ) : (
            <Text style={styles.buttonText}>Update password</Text>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { flex: 1, gap: spacing.md, padding: spacing.lg },
  title: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 24,
    fontWeight: "900",
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: palette.ink,
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  message: { color: palette.red, fontSize: 13, lineHeight: 19 },
  button: {
    alignItems: "center",
    backgroundColor: palette.blue,
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 50,
  },
  buttonText: { color: palette.white, fontWeight: "900" },
  disabled: { opacity: 0.6 },
});
