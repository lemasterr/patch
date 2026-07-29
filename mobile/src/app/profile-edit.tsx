import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Avatar } from "@/components/avatar";
import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { palette, spacing, type } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

export default function ProfileEditScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    if (
      !session ||
      !displayName.trim() ||
      !/^[a-z0-9_]{3,24}$/.test(username.trim().toLowerCase())
    ) {
      setMessage("Add a name and a valid 3–24 character username.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim(),
          username: username.trim().toLowerCase(),
          bio: bio.trim() || null,
        })
        .eq("id", session.user.id);
      if (error) {
        setMessage(
          error.code === "23505"
            ? "That username is already taken."
            : "Could not save your profile.",
        );
        return;
      }
      await refreshProfile();
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <PatchHeader
        back
        title="Edit profile"
        showNotifications={false}
        right={
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            hitSlop={10}
            onPress={() => void save()}
            style={({ pressed }) => [
              styles.doneButton,
              (pressed || saving) && styles.pressed,
            ]}
          >
            <Text style={styles.doneText}>{saving ? "Saving…" : "Done"}</Text>
          </Pressable>
        }
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.avatarSection}>
            <Avatar size={92} avatarKey={profile?.avatar_key} />
            <View style={styles.avatarCopy}>
              <Text style={styles.avatarTitle}>Profile photo</Text>
              <Text style={styles.avatarHint}>Your current Patch identity</Text>
            </View>
          </View>
          <Text style={styles.sectionLabel}>PROFILE</Text>
          <View style={styles.form}>
            <Field
              label="Name"
              value={displayName}
              onChangeText={setDisplayName}
            />
            <Field
              label="Username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Field
              label="Bio"
              value={bio}
              onChangeText={setBio}
              multiline
              maxLength={240}
            />
          </View>
          <View style={styles.formFooter}>
            {message ? (
              <Text style={styles.message}>{message}</Text>
            ) : (
              <Text style={styles.counter}>{bio.length}/240</Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({
  label,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={palette.inkMuted}
        style={[styles.input, props.multiline && styles.bioInput]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  content: { paddingBottom: spacing.xxl },
  doneButton: {
    minWidth: 52,
    minHeight: 44,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  doneText: { color: palette.blueBright, fontSize: 16, fontWeight: "800" },
  avatarSection: {
    minHeight: 132,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatarCopy: { flex: 1, gap: 3 },
  avatarTitle: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 19,
    fontWeight: "900",
  },
  avatarHint: { color: palette.inkMuted, fontSize: 13 },
  sectionLabel: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
    color: palette.inkMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  form: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  fieldWrap: {
    minHeight: 58,
    marginLeft: spacing.lg,
    paddingRight: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  label: {
    width: 92,
    color: palette.inkMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    minHeight: 58,
    flex: 1,
    paddingVertical: spacing.sm,
    color: palette.ink,
    fontSize: 16,
  },
  bioInput: { minHeight: 96, paddingTop: 18, textAlignVertical: "top" },
  formFooter: {
    minHeight: 38,
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    alignItems: "flex-end",
  },
  counter: { color: palette.inkMuted, fontSize: 11 },
  message: { alignSelf: "stretch", color: palette.red, fontSize: 13 },
  pressed: { opacity: 0.55 },
});
