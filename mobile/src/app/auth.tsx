import { MaterialCommunityIcons } from "@expo/vector-icons";
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
import { supabase, supabaseConfigurationError } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

const passwordRules = [
  { label: "8+ characters", test: (value: string) => value.length >= 8 },
  { label: "lowercase", test: (value: string) => /[a-z]/.test(value) },
  { label: "uppercase", test: (value: string) => /[A-Z]/.test(value) },
  { label: "number", test: (value: string) => /\d/.test(value) },
] as const;

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsInfo, setMessageIsInfo] = useState(false);
  const [busy, setBusy] = useState(false);
  const backendIsMissing = Boolean(supabaseConfigurationError);

  async function submit() {
    if (!email.trim() || !password) {
      setMessageIsInfo(false);
      setMessage("Enter your email and password.");
      return;
    }
    if (mode === "signup") {
      const missingRule = passwordRules.some((rule) => !rule.test(password));
      if (missingRule) {
        setMessageIsInfo(false);
        setMessage("Use all four password requirements shown below.");
        return;
      }
      if (password !== confirmPassword) {
        setMessageIsInfo(false);
        setMessage("The passwords do not match.");
        return;
      }
    }

    setBusy(true);
    setMessage(null);
    const error =
      mode === "signin"
        ? await signIn(email, password)
        : await signUp(email, password);
    setBusy(false);
    if (error) {
      setMessageIsInfo(false);
      setMessage(error);
      return;
    }
    if (mode === "signup") {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace("/");
        return;
      }
      setMessageIsInfo(true);
      setMessage("Check your email to confirm the account, then sign in.");
      setMode("signin");
      setConfirmPassword("");
    } else {
      router.replace("/");
    }
  }

  async function resendConfirmation() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setMessageIsInfo(false);
      setMessage("Enter your email first.");
      return;
    }
    setBusy(true);
    await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: "patch://auth/callback" },
    });
    setBusy(false);
    setMessageIsInfo(true);
    setMessage("If that account needs confirmation, we sent another link.");
  }

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <AnimatedMascot size={222} variant="welcome" />
            <Text style={styles.brand}>Patch</Text>
            <Text style={styles.tagline}>
              Collect the moments that made your journey yours.
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.heading}>
              {mode === "signin" ? "Welcome back" : "Create account"}
            </Text>
            <View style={styles.field}>
              <MaterialCommunityIcons
                name="email-outline"
                size={20}
                color={palette.inkMuted}
              />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={palette.inkMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                style={styles.input}
              />
            </View>
            <PasswordField
              value={password}
              visible={passwordVisible}
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              placeholder="Password"
              onChangeText={setPassword}
              onToggleVisibility={() => setPasswordVisible((value) => !value)}
            />
            {mode === "signup" ? (
              <>
                <PasswordField
                  value={confirmPassword}
                  visible={passwordVisible}
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  onChangeText={setConfirmPassword}
                  onToggleVisibility={() =>
                    setPasswordVisible((value) => !value)
                  }
                />
                <View style={styles.rules}>
                  {passwordRules.map((rule) => {
                    const passed = rule.test(password);
                    return (
                      <View key={rule.label} style={styles.rule}>
                        <MaterialCommunityIcons
                          name={passed ? "check-circle" : "circle-outline"}
                          size={13}
                          color={passed ? palette.green : palette.inkMuted}
                        />
                        <Text
                          style={[
                            styles.ruleText,
                            passed && styles.ruleTextPassed,
                          ]}
                        >
                          {rule.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}
            {backendIsMissing ? (
              <Text style={styles.message}>{supabaseConfigurationError}</Text>
            ) : message ? (
              <Text
                style={[styles.message, messageIsInfo && styles.infoMessage]}
              >
                {message}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => void submit()}
              disabled={busy || backendIsMissing}
              style={({ pressed }) => [
                styles.primary,
                (busy || backendIsMissing) && styles.primaryDisabled,
                pressed && !backendIsMissing && styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={palette.white} />
              ) : (
                <Text style={styles.primaryText}>
                  {mode === "signin" ? "Sign in" : "Create account"}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                setMode((value) => (value === "signin" ? "signup" : "signin"));
                setMessage(null);
                setConfirmPassword("");
              }}
              style={styles.switchButton}
            >
              <Text style={styles.switchText}>
                {mode === "signin"
                  ? "New to Patch? Create account"
                  : "Already have an account? Sign in"}
              </Text>
            </Pressable>
            {mode === "signin" ? (
              <View style={styles.authLinks}>
                <Pressable onPress={() => router.push("/forgot-password")}>
                  <Text style={styles.switchText}>Forgot password?</Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() => void resendConfirmation()}
                >
                  <Text style={styles.switchText}>Resend confirmation</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function PasswordField({
  value,
  visible,
  autoComplete,
  placeholder,
  onChangeText,
  onToggleVisibility,
}: {
  value: string;
  visible: boolean;
  autoComplete: "current-password" | "new-password";
  placeholder: string;
  onChangeText: (value: string) => void;
  onToggleVisibility: () => void;
}) {
  return (
    <View style={styles.field}>
      <MaterialCommunityIcons
        name="lock-outline"
        size={20}
        color={palette.inkMuted}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.inkMuted}
        secureTextEntry={!visible}
        autoComplete={autoComplete}
        style={styles.input}
      />
      <Pressable
        accessibilityLabel={visible ? "Hide password" : "Show password"}
        hitSlop={8}
        onPress={onToggleVisibility}
      >
        <MaterialCommunityIcons
          name={visible ? "eye-off-outline" : "eye-outline"}
          size={19}
          color={palette.inkMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  hero: { alignItems: "center" },
  brand: {
    marginTop: -12,
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1.4,
  },
  tagline: {
    marginTop: 2,
    maxWidth: 290,
    color: palette.inkMuted,
    fontFamily: type.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  form: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  heading: {
    marginBottom: spacing.xs,
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 22,
    fontWeight: "900",
  },
  field: {
    height: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  input: {
    flex: 1,
    color: palette.ink,
    fontFamily: type.regular,
    fontSize: 15,
  },
  rules: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  rule: { flexDirection: "row", alignItems: "center", gap: 3 },
  ruleText: { color: palette.inkMuted, fontSize: 9, fontWeight: "700" },
  ruleTextPassed: { color: palette.green },
  message: { color: palette.red, fontSize: 11, lineHeight: 16 },
  infoMessage: { color: palette.blue },
  primary: {
    height: 52,
    marginTop: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: palette.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { color: palette.white, fontSize: 15, fontWeight: "900" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  switchButton: { alignItems: "center", paddingVertical: spacing.sm },
  authLinks: { alignItems: "center", gap: spacing.sm },
  switchText: { color: palette.blue, fontSize: 12, fontWeight: "800" },
});
