import { MaterialCommunityIcons } from "@expo/vector-icons";
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

import { AnimatedMascot } from "@/components/animated-mascot";
import { Screen } from "@/components/screen";
import { palette, radius, spacing, type } from "@/constants/theme";
import { useAuth } from "@/providers/auth-provider";

export default function OnboardingScreen() {
  const { completeOnboarding } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"discover" | "profile">("discover");

  async function submit() {
    setBusy(true);
    const error = await completeOnboarding({ username, displayName });
    setBusy(false);
    if (error) return setMessage(error);
    router.replace("/(tabs)/discover");
  }

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      {stage === "discover" ? (
        <View style={styles.tutorial}>
          <View style={styles.tutorialHero}>
            <AnimatedMascot size={156} variant="welcome" />
            <Text style={styles.title}>Discover your way</Text>
            <Text style={styles.body}>
              Every Patch responds to the same simple gestures.
            </Text>
          </View>
          <View style={styles.gestureGuide}>
            <GestureGuide
              icon="arrow-right"
              label="Swipe right"
              detail="Like"
            />
            <GestureGuide
              icon="arrow-left"
              label="Swipe left"
              detail="Not for me"
            />
            <GestureGuide icon="arrow-up" label="Swipe up" detail="Skip" />
            <GestureGuide
              icon="undo-variant"
              label="Pull down"
              detail="Bring the last Patch back"
            />
            <GestureGuide
              icon="gesture-tap"
              label="Tap anywhere"
              detail="Open the full story"
            />
          </View>
          <Pressable
            onPress={() => setStage("profile")}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>Set up my profile</Text>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.root}
        >
          <View style={styles.hero}>
            <AnimatedMascot size={150} variant="welcome" />
            <Text style={styles.title}>Make it yours</Text>
            <Text style={styles.body}>
              Your name and tag are how friends find your Patches.
            </Text>
          </View>
          <View style={styles.form}>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Display name"
              placeholderTextColor={palette.inkMuted}
              autoCapitalize="words"
              style={styles.input}
            />
            <View style={styles.usernameField}>
              <Text style={styles.at}>@</Text>
              <TextInput
                value={username}
                onChangeText={(value) =>
                  setUsername(value.replace(/[^a-zA-Z0-9_]/g, ""))
                }
                placeholder="username"
                placeholderTextColor={palette.inkMuted}
                autoCapitalize="none"
                style={[styles.input, styles.usernameInput]}
              />
            </View>
            {message ? <Text style={styles.message}>{message}</Text> : null}
            <Pressable
              onPress={() => void submit()}
              disabled={busy}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={palette.white} />
              ) : (
                <Text style={styles.buttonText}>Enter Patch</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

function GestureGuide({
  icon,
  label,
  detail,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  detail: string;
}) {
  return (
    <View style={styles.gestureRow}>
      <MaterialCommunityIcons
        name={icon}
        size={21}
        color={palette.blueBright}
      />
      <Text style={styles.gestureLabel}>{label}</Text>
      <Text style={styles.gestureDetail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "space-between", padding: spacing.xl },
  tutorial: {
    flex: 1,
    padding: spacing.xl,
    paddingBottom: spacing.lg,
    justifyContent: "space-between",
  },
  tutorialHero: { alignItems: "center" },
  gestureGuide: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  gestureRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  gestureLabel: {
    width: 94,
    color: palette.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  gestureDetail: { flex: 1, color: palette.inkMuted, fontSize: 12 },
  hero: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 32,
    fontWeight: "900",
  },
  body: {
    marginTop: spacing.xs,
    maxWidth: 300,
    color: palette.inkMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  form: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  input: {
    height: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.md,
    color: palette.ink,
    fontSize: 16,
  },
  usernameField: { position: "relative", justifyContent: "center" },
  usernameInput: { paddingLeft: 38 },
  at: {
    position: "absolute",
    left: spacing.md,
    zIndex: 1,
    color: palette.blue,
    fontSize: 17,
    fontWeight: "800",
  },
  message: { color: palette.red, fontSize: 13 },
  button: {
    height: 54,
    borderRadius: radius.md,
    backgroundColor: palette.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: palette.white, fontWeight: "800", fontSize: 16 },
  pressed: { opacity: 0.78 },
});
