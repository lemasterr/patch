import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AnimatedMascot } from "@/components/animated-mascot";
import { Screen } from "@/components/screen";
import { palette, radius, spacing, type } from "@/constants/theme";
import { useAuth } from "@/providers/auth-provider";

export default function OnboardingScreen() {
  const { completeOnboarding } = useAuth();
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const normalizedUsername = username.trim().toLowerCase();
      const error = await completeOnboarding({
        username: normalizedUsername,
        // A username-first profile intentionally starts with the same compact
        // identity. The editable display name remains available in Profile.
        displayName: normalizedUsername,
      });
      if (error) {
        setMessage(error);
        return;
      }
      router.replace("/(tabs)/discover");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <AnimatedMascot size={132} variant="welcome" />
            <Text style={styles.title}>Choose your username</Text>
          </View>
          <View style={styles.form}>
            <View style={styles.usernameField}>
              <Text accessibilityElementsHidden style={styles.at}>
                @
              </Text>
              <TextInput
                accessibilityLabel="Username"
                autoCapitalize="none"
                autoComplete="username-new"
                autoCorrect={false}
                maxLength={24}
                onChangeText={(value) =>
                  setUsername(value.replace(/[^a-zA-Z0-9_]/g, ""))
                }
                placeholder="username"
                placeholderTextColor={palette.inkMuted}
                returnKeyType="done"
                style={styles.input}
                value={username}
                onSubmitEditing={() => void submit()}
              />
            </View>
            {message ? (
              <Text accessibilityLiveRegion="polite" style={styles.message}>
                {message}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.button,
                (pressed || busy) && styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={palette.white} />
              ) : (
                <Text style={styles.buttonText}>Continue</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  content: {
    flexGrow: 1,
    gap: spacing.lg,
    justifyContent: "center",
    padding: spacing.xl,
  },
  hero: { alignItems: "center", gap: spacing.sm },
  title: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
  },
  form: { gap: spacing.sm },
  usernameField: { justifyContent: "center", position: "relative" },
  at: {
    color: palette.blue,
    fontSize: 18,
    fontWeight: "900",
    left: spacing.md,
    position: "absolute",
    zIndex: 1,
  },
  input: {
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: 40,
  },
  message: { color: palette.red, fontSize: 13, lineHeight: 18 },
  button: {
    alignItems: "center",
    backgroundColor: palette.blue,
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 54,
  },
  buttonText: { color: palette.white, fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.78 },
});
