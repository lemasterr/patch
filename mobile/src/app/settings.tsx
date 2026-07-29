import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { PatchHeader } from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { palette, radius, spacing, type } from "@/constants/theme";

const destinations = [
  {
    key: "account",
    icon: "account-circle-outline",
    title: "Account",
    body: "Profile, sign-in, and account deletion.",
  },
  {
    key: "appearance",
    icon: "palette-outline",
    title: "Appearance",
    body: "Choose a clear light, dark, or system theme.",
  },
  {
    key: "privacy",
    icon: "shield-account-outline",
    title: "Privacy & safety",
    body: "Profile visibility, hidden Patches, and blocks.",
  },
  {
    key: "notifications",
    icon: "bell-outline",
    title: "Notifications",
    body: "In-app and remote alerts for the moments you choose.",
  },
] as const;

export default function SettingsScreen() {
  return (
    <Screen>
      <PatchHeader back title="Settings" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {destinations.map((item) => (
            <Pressable
              key={item.key}
              accessibilityLabel={`Open ${item.title} settings`}
              onPress={() => router.push(`/settings/${item.key}`)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.icon}>
                <MaterialCommunityIcons
                  name={item.icon}
                  size={23}
                  color={palette.blue}
                />
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={21}
                color={palette.inkMuted}
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  grid: {},
  card: {
    alignItems: "center",
    borderBottomColor: palette.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 58,
    padding: spacing.md,
  },
  icon: {
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  cardTitle: {
    flex: 1,
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 15,
    fontWeight: "900",
  },
  pressed: { opacity: 0.68, transform: [{ scale: 0.985 }] },
});
