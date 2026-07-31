import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { palette, radius, spacing } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

function validPassword(value: string) {
  return (
    value.length >= 8 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}

export default function AccountSecurityScreen() {
  const { session } = useAuth();
  const [email, setEmail] = useState(session?.user.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    const normalizedEmail = email.trim().toLowerCase();
    const emailChanged =
      normalizedEmail !== (session?.user.email ?? "").toLowerCase();
    const passwordChanged = Boolean(newPassword);
    if (!emailChanged && !passwordChanged) {
      setSuccess(false);
      setMessage("Nothing changed yet.");
      return;
    }
    if (emailChanged && !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setSuccess(false);
      setMessage("Enter a valid email address.");
      return;
    }
    if (passwordChanged && !validPassword(newPassword)) {
      setSuccess(false);
      setMessage("Use 8+ characters with lowercase, uppercase, and a number.");
      return;
    }
    if (passwordChanged && newPassword !== confirmPassword) {
      setSuccess(false);
      setMessage("The new passwords do not match.");
      return;
    }

    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({
      ...(emailChanged ? { email: normalizedEmail } : {}),
      ...(passwordChanged ? { password: newPassword } : {}),
      ...(currentPassword ? { current_password: currentPassword } : {}),
    });
    setBusy(false);
    if (error) {
      setSuccess(false);
      setMessage(error.message);
      return;
    }
    setSuccess(true);
    setMessage(
      emailChanged
        ? "Saved. Check your email if confirmation is required."
        : "Your password has been updated.",
    );
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <Screen>
      <PatchHeader back title="Security" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.group}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
            placeholderTextColor={palette.inkMuted}
            style={styles.input}
          />
        </View>
        <View style={styles.group}>
          <Text style={styles.label}>Current password</Text>
          <TextInput
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            autoComplete="current-password"
            placeholder="Current password"
            placeholderTextColor={palette.inkMuted}
            style={styles.input}
          />
          <Text style={styles.passwordHint}>
            Use 8+ characters with lowercase, uppercase, and a number.
          </Text>
          <Text style={styles.label}>New password</Text>
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoComplete="new-password"
            placeholder="8+ characters, upper/lowercase, number"
            placeholderTextColor={palette.inkMuted}
            style={styles.input}
          />
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="new-password"
            placeholder="Confirm new password"
            placeholderTextColor={palette.inkMuted}
            style={styles.input}
          />
        </View>

        {message ? (
          <View style={styles.messageRow}>
            <MaterialCommunityIcons
              name={success ? "check-circle-outline" : "alert-circle-outline"}
              size={17}
              color={success ? palette.green : palette.red}
            />
            <Text style={[styles.message, success && styles.success]}>
              {message}
            </Text>
          </View>
        ) : null}
        <Pressable
          disabled={busy}
          onPress={() => void save()}
          style={styles.saveButton}
        >
          {busy ? (
            <ActivityIndicator color={palette.white} />
          ) : (
            <Text style={styles.saveText}>Save account</Text>
          )}
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  group: {
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    borderColor: palette.border,
  },
  passwordHint: { color: palette.inkMuted, fontSize: 12, lineHeight: 17 },
  label: { marginTop: 2, color: palette.ink, fontSize: 11, fontWeight: "900" },
  input: {
    height: 50,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    color: palette.ink,
    fontSize: 13,
  },
  messageRow: {
    paddingHorizontal: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  message: { flex: 1, color: palette.red, fontSize: 11, lineHeight: 15 },
  success: { color: palette.green },
  saveButton: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: palette.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: palette.white, fontSize: 14, fontWeight: "900" },
});
