import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { AchievementArt } from "@/components/achievement-art";
import { AnimatedMascot } from "@/components/animated-mascot";
import { PATCH_ASPECT_RATIO } from "@/constants/patch-layout";
import { Screen } from "@/components/screen";
import { palette, radius, spacing, type } from "@/constants/theme";
import { getAchievement } from "@/lib/queries";
import { trackProductEvent } from "@/lib/product-analytics";
import { supabase } from "@/lib/supabase";
import type { Achievement } from "@/types/domain";

const confettiColors = [
  palette.gold,
  palette.blueBright,
  palette.red,
  palette.green,
  palette.lilac,
  palette.teal,
  "#FFFFFF",
];

export default function RevealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { width, height } = useWindowDimensions();
  const [achievement, setAchievement] = useState<Achievement | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active",
  );
  const [reduceMotion, setReduceMotion] = useState(false);
  const [reveal] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  const [generationProgress] = useState(() => new Animated.Value(0.18));
  const [confetti] = useState(() =>
    Array.from({ length: 20 }, () => new Animated.Value(0)),
  );
  const celebrated = useRef(false);
  const pollAttempts = useRef(0);

  const loadAchievement = useCallback(async () => {
    const item = await getAchievement(id);
    setAchievement(item);
    if (item?.status === "processing") setTimedOut(false);
    return item;
  }, [id]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    celebrated.current = false;
    pollAttempts.current = 0;
    const initialLoad = setTimeout(() => {
      void loadAchievement().catch(() => setTimedOut(true));
    }, 0);

    const channel = supabase
      .channel(`achievement-reveal:${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "achievements",
          filter: `id=eq.${id}`,
        },
        () => void loadAchievement().catch(() => setTimedOut(true)),
      )
      .subscribe();

    return () => {
      clearTimeout(initialLoad);
      void supabase.removeChannel(channel);
    };
  }, [id, loadAchievement]);

  useEffect(() => {
    if (!appActive || achievement?.status !== "processing") return;
    if (pollAttempts.current >= 24) {
      const timeout = setTimeout(() => setTimedOut(true), 0);
      return () => clearTimeout(timeout);
    }
    const timer = setTimeout(() => {
      pollAttempts.current += 1;
      void loadAchievement().catch(() => setTimedOut(true));
    }, 5_000);
    return () => clearTimeout(timer);
  }, [achievement?.status, appActive, loadAchievement]);

  useEffect(() => {
    if (achievement?.status !== "completed" || celebrated.current) return;
    celebrated.current = true;
    void trackProductEvent("reveal", achievement.id).catch(() => undefined);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void supabase
      .from("achievements")
      .update({ reveal_viewed_at: new Date().toISOString() })
      .eq("id", achievement.id);
    void queryClient.invalidateQueries({
      queryKey: ["achievements", "owned", achievement.owner_id],
    });
    if (reduceMotion) {
      reveal.setValue(1);
      pulse.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.spring(reveal, {
        toValue: 1,
        speed: 8,
        bounciness: 13,
        useNativeDriver: true,
      }),
      ...confetti.map((value, index) =>
        Animated.sequence([
          Animated.delay((index % 7) * 55),
          Animated.timing(value, {
            toValue: 1,
            duration: 1450 + (index % 6) * 130,
            useNativeDriver: true,
          }),
        ]),
      ),
    ]).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [achievement, confetti, pulse, queryClient, reduceMotion, reveal]);

  useEffect(() => {
    if (achievement?.status !== "processing") {
      generationProgress.stopAnimation();
      return;
    }
    if (reduceMotion) {
      generationProgress.setValue(0.72);
      return;
    }
    generationProgress.setValue(0.18);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(generationProgress, {
          toValue: 0.92,
          duration: 1250,
          useNativeDriver: true,
        }),
        Animated.timing(generationProgress, {
          toValue: 0.36,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [achievement?.status, generationProgress, reduceMotion]);

  async function retryGeneration() {
    if (!achievement) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const { error } = await supabase.functions.invoke("retry-achievement", {
        body: { achievementId: achievement.id },
      });
      if (error) throw error;
      pollAttempts.current = 0;
      setTimedOut(false);
      setAchievement((current) =>
        current ? { ...current, status: "processing" } : current,
      );
      await loadAchievement();
    } catch (error) {
      setRetryError(
        error instanceof Error
          ? error.message
          : "Could not retry Patch generation.",
      );
    } finally {
      setRetrying(false);
    }
  }

  const pieces = useMemo(
    () =>
      confetti.map((value, index) => ({
        value,
        left: ((index * 73) % Math.max(1, width - 20)) + 4,
        color: confettiColors[index % confettiColors.length],
        drift: ((index % 7) - 3) * 29,
        rotation: 180 + (index % 5) * 96,
        width: index % 4 === 0 ? 11 : index % 3 === 0 ? 7 : 5,
        height: index % 4 === 0 ? 5 : 13,
        round: index % 5 === 0,
      })),
    [confetti, width],
  );

  const completed = achievement?.status === "completed";
  const failed = achievement?.status === "failed";

  return (
    <Screen dark edges={["top", "bottom", "left", "right"]}>
      {completed && !reduceMotion
        ? pieces.map((piece, index) => (
            <Animated.View
              key={index}
              style={[
                styles.confetti,
                {
                  left: piece.left,
                  backgroundColor: piece.color,
                  width: piece.width,
                  height: piece.height,
                  borderRadius: piece.round ? piece.width / 2 : 2,
                  opacity: piece.value.interpolate({
                    inputRange: [0, 0.1, 0.88, 1],
                    outputRange: [0, 1, 1, 0],
                  }),
                  transform: [
                    {
                      translateY: piece.value.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-46 - (index % 4) * 18, height * 0.88],
                      }),
                    },
                    {
                      translateX: piece.value.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0, piece.drift, -piece.drift * 0.3],
                      }),
                    },
                    {
                      rotate: piece.value.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0deg", `${piece.rotation}deg`],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))
        : null}

      <View style={styles.content}>
        <View style={styles.eyebrowRow}>
          <MaterialCommunityIcons
            name={
              failed
                ? "alert-circle-outline"
                : completed
                  ? "creation"
                  : "progress-clock"
            }
            size={20}
            color={failed ? palette.red : palette.gold}
          />
          <Text style={styles.eyebrow}>
            {failed
              ? "Generation stopped"
              : completed
                ? "Patch unlocked"
                : "Crafting your Patch"}
          </Text>
        </View>

        {achievement?.status === "processing" ? (
          <View style={[styles.artWrap, { width: Math.min(width - 72, 330) }]}>
            <View style={[styles.art, styles.placeholder]}>
              <AnimatedMascot
                size={Math.min(width - 104, 242)}
                variant="loading"
              />
            </View>
          </View>
        ) : achievement ? (
          <Animated.View
            style={[
              styles.artWrap,
              { width: Math.min(width - 72, 330) },
              completed && {
                opacity: reveal,
                transform: [
                  {
                    scale: reveal.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.62, 1],
                    }),
                  },
                  {
                    translateY: reveal.interpolate({
                      inputRange: [0, 1],
                      outputRange: [36, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Animated.View
              style={{
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, completed ? 1.025 : 1],
                    }),
                  },
                ],
              }}
            >
              <AchievementArt
                achievement={achievement}
                framed={completed}
                style={styles.art}
              />
            </Animated.View>
          </Animated.View>
        ) : (
          <View style={[styles.artWrap, { width: Math.min(width - 72, 330) }]}>
            <View style={[styles.art, styles.placeholder]}>
              <AnimatedMascot
                size={Math.min(width - 104, 242)}
                variant="loading"
              />
            </View>
          </View>
        )}

        <Text style={styles.title}>
          {achievement?.title ?? "Making something memorable…"}
        </Text>
        <Text style={styles.body}>
          {failed
            ? "The image could not be generated this time. Your Patch is safe and can be retried."
            : completed
              ? "A new part of your story is now in My Patch."
              : timedOut
                ? "This is taking longer than usual. You can leave safely and check Activity later."
                : "Patch is illustrating your moment. You can keep this screen open or return later."}
        </Text>
        {retryError ? (
          <Text style={styles.retryError}>{retryError}</Text>
        ) : null}

        {!completed && !failed ? (
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progress,
                {
                  transform: [
                    {
                      scaleX: generationProgress,
                    },
                  ],
                },
              ]}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        {completed ? (
          <Pressable
            onPress={() => router.dismissTo("/(tabs)/collection")}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>View in collection</Text>
          </Pressable>
        ) : failed ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: retrying }}
              disabled={retrying}
              onPress={() => void retryGeneration()}
              style={({ pressed }) => [
                styles.primary,
                (pressed || retrying) && styles.pressed,
              ]}
            >
              <Text style={styles.primaryText}>
                {retrying ? "Retrying…" : "Retry generation"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.dismissTo("/(tabs)/collection")}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>Back to collection</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => router.dismissTo("/(tabs)/discover")}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>Continue exploring</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  confetti: {
    position: "absolute",
    zIndex: 4,
    top: -16,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  eyebrow: {
    color: palette.gold,
    fontFamily: type.rounded,
    fontSize: 17,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  artWrap: { width: "100%", aspectRatio: PATCH_ASPECT_RATIO },
  art: { width: "100%", height: "100%", borderRadius: radius.xl },
  placeholder: {
    backgroundColor: "rgba(106,157,218,0.12)",
    borderWidth: 1,
    borderColor: "rgba(106,157,218,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: spacing.xl,
    color: palette.white,
    fontFamily: type.rounded,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.7,
  },
  body: {
    marginTop: spacing.sm,
    maxWidth: 330,
    color: "rgba(255,255,255,0.64)",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  retryError: {
    marginTop: spacing.sm,
    maxWidth: 330,
    color: "#FFAAA4",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  progressTrack: {
    width: 180,
    height: 4,
    marginTop: spacing.xl,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  progress: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.blueBright,
  },
  actions: { padding: spacing.lg },
  primary: {
    height: 56,
    borderRadius: radius.md,
    backgroundColor: palette.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: palette.navy, fontSize: 16, fontWeight: "900" },
  secondary: { height: 52, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: palette.white, fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
});
