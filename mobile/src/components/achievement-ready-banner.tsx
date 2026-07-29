import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassSurface } from "@/components/glass-surface";
import { palette, radius, shadow, spacing, type } from "@/constants/theme";
import type { PatchNotification } from "@/types/domain";

export function AchievementReadyBanner({
  notification,
  onOpen,
  onDismiss,
}: {
  notification: PatchNotification;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [entry] = useState(() => new Animated.Value(0));

  useEffect(() => {
    entry.setValue(0);
    Animated.spring(entry, {
      toValue: 1,
      stiffness: 300,
      damping: 24,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  }, [entry, notification.id]);

  return (
    <Animated.View
      accessibilityLiveRegion="assertive"
      style={[
        styles.position,
        {
          top: insets.top + spacing.xs,
          opacity: entry,
          transform: [
            {
              translateY: entry.interpolate({
                inputRange: [0, 1],
                outputRange: [-24, 0],
              }),
            },
            {
              scale: entry.interpolate({
                inputRange: [0, 1],
                outputRange: [0.96, 1],
              }),
            },
          ],
        },
      ]}
    >
      <GlassSurface
        effect="regular"
        interactive
        tintColor="rgba(28,66,91,0.72)"
        style={styles.banner}
      >
        <Pressable
          accessibilityLabel={`${notification.title}. ${notification.body}. Open new Patch`}
          accessibilityRole="button"
          onPress={onOpen}
          style={({ pressed }) => [styles.open, pressed && styles.openPressed]}
        >
          <View style={styles.icon}>
            <MaterialCommunityIcons
              name="creation"
              size={20}
              color={palette.navy}
            />
          </View>
          <View style={styles.copy}>
            <Text style={styles.eyebrow}>NEW PATCH</Text>
            <Text numberOfLines={1} style={styles.title}>
              {notification.title}
            </Text>
            <Text numberOfLines={1} style={styles.body}>
              {notification.body}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityLabel="Dismiss new Patch notification"
          hitSlop={8}
          onPress={onDismiss}
          style={styles.close}
        >
          <MaterialCommunityIcons
            name="close"
            size={18}
            color={palette.inkMuted}
          />
        </Pressable>
      </GlassSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  position: {
    position: "absolute",
    zIndex: 100,
    left: spacing.sm,
    right: spacing.sm,
    ...shadow,
    elevation: 18,
  },
  banner: {
    minHeight: 76,
    borderRadius: radius.lg,
    flexDirection: "row",
    alignItems: "center",
  },
  open: {
    minWidth: 0,
    flex: 1,
    minHeight: 76,
    paddingLeft: spacing.sm,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  openPressed: { opacity: 0.78 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.gold,
  },
  copy: { minWidth: 0, flex: 1 },
  eyebrow: {
    color: palette.gold,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  title: {
    marginTop: 1,
    color: palette.white,
    fontFamily: type.rounded,
    fontSize: 14,
    fontWeight: "900",
  },
  body: {
    marginTop: 1,
    color: palette.inkMuted,
    fontSize: 11,
  },
  close: {
    width: 44,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
});
