import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setMessage("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setMessage(null);
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: "patch://auth/callback?type=recovery",
    });
    setBusy(false);
    setMessage(
      "If an account uses that email, we sent a recovery link. Check your inbox.",
    );
  }
  return (
    <Screen>
      <PatchHeader back title="Reset password" showNotifications={false} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.root}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Get back to your Patches</Text>
          <Text style={styles.body}>
            Enter your email and we’ll send a secure password-reset link.
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={palette.inkMuted}
            style={styles.input}
          />
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <Pressable
            disabled={busy}
            onPress={() => void submit()}
            style={[styles.button, busy && styles.disabled]}
          >
            {busy ? (
              <ActivityIndicator color={palette.white} />
            ) : (
              <Text style={styles.buttonText}>Send reset link</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => router.replace("/auth")}
            style={styles.link}
          >
            <Text style={styles.linkText}>Back to sign in</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, gap: spacing.md, padding: spacing.lg },
  title: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 24,
    fontWeight: "900",
    marginTop: spacing.lg,
  },
  body: { color: palette.inkMuted, fontSize: 14, lineHeight: 21 },
  input: {
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: palette.ink,
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  message: { color: palette.inkMuted, fontSize: 13, lineHeight: 19 },
  button: {
    alignItems: "center",
    backgroundColor: palette.blue,
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: 50,
  },
  buttonText: { color: palette.white, fontWeight: "900" },
  link: { alignItems: "center", minHeight: 44, justifyContent: "center" },
  linkText: { color: palette.blue, fontWeight: "800" },
  disabled: { opacity: 0.6 },
});
