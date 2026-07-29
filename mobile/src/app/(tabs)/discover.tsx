/* eslint-disable react-hooks/immutability, react-hooks/refs -- Reanimated shared values and gesture callbacks intentionally mutate/read outside React render. */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AchievementArt } from "@/components/achievement-art";
import { AnimatedMascot } from "@/components/animated-mascot";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { FeatureUnavailable } from "@/components/feature-unavailable";
import {
  HeaderIcon,
  NotificationButton,
  PatchHeader,
} from "@/components/patch-header";
import { Screen } from "@/components/screen";
import { patchLayout } from "@/constants/patch-layout";
import { palette, radius, spacing, type } from "@/constants/theme";
import {
  feedbackForSwipe,
  previewSwipeDirection,
  resolveSwipeDirection,
  type DiscoverFeedback,
  type SwipeDirection,
} from "@/features/discover/gesture-logic";
import {
  applyDiscoverFeedAction,
  type DiscoverCursor,
  getDiscoverFeed,
  getFriendFeed,
  recordDiscoverEngagement,
  resetDiscoverRecommendations,
  undoDiscoverFeedAction,
} from "@/lib/queries";
import { trackProductEvent } from "@/lib/product-analytics";
import { useAuth } from "@/providers/auth-provider";
import { useFeatureFlags } from "@/providers/feature-flag-provider";
import { useOffline } from "@/providers/offline-provider";
import type { Achievement } from "@/types/domain";

type DismissDirection = Exclude<SwipeDirection, "down">;
type FeedAction = DiscoverFeedback;

type HistoryEntry = {
  achievement: Achievement;
  action: FeedAction;
  operationId: string;
};

type TapBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const pageSize = 16;
const swipeSettleDuration = 170;

function createOperationId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    },
  );
}

function outcomeForDirection(direction: SwipeDirection) {
  switch (direction) {
    case "right":
      return {
        color: palette.red,
        icon: "heart" as const,
      };
    case "left":
      return {
        color: "#F08A7C",
        icon: "heart-broken" as const,
      };
    case "up":
      return {
        color: palette.blue,
        icon: "arrow-up" as const,
      };
    case "down":
      return {
        color: palette.teal,
        icon: "undo-variant" as const,
      };
  }
}

export default function DiscoverScreen() {
  const { isEnabled } = useFeatureFlags();
  if (isEnabled("discover_enabled")) {
    return <DiscoverContent socialEnabled={isEnabled("social_enabled")} />;
  }
  return (
    <Screen>
      <PatchHeader title="Discover" />
      <FeatureUnavailable
        title="Discover is temporarily paused"
        body="Please check back shortly. Your Collection is still available."
      />
    </Screen>
  );
}

function DiscoverContent({ socialEnabled }: { socialEnabled: boolean }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { session } = useAuth();
  const { enqueue } = useOffline();
  const { feed } = useLocalSearchParams<{ feed?: string }>();
  const [mode, setMode] = useState<"for-you" | "friends">(
    socialEnabled && feed === "friends" ? "friends" : "for-you",
  );
  const friendsMode = socialEnabled && mode === "friends";
  const [items, setItems] = useState<Achievement[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [undoCommitting, setUndoCommitting] = useState(false);
  const [undoOverlay, setUndoOverlay] = useState<Achievement | null>(null);
  const [dismissOverlay, setDismissOverlay] = useState<Achievement | null>(
    null,
  );
  const [dismissDirection, setDismissDirection] =
    useState<DismissDirection | null>(null);
  const [currentCardHeight, setCurrentCardHeight] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const itemsRef = useRef<Achievement[]>([]);
  const historyRef = useRef<HistoryEntry[]>([]);
  const nextCursorRef = useRef<DiscoverCursor | null>(null);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const loadedRef = useRef(false);
  const authorTapBoundsRef = useRef<TapBounds | null>(null);
  const descriptionTapBoundsRef = useRef<TapBounds | null>(null);
  const descriptionToggleRef = useRef<(() => void) | null>(null);
  const pendingCardHeightRef = useRef(0);
  const dismissAnimationDoneRef = useRef(false);
  const dismissStateReadyRef = useRef(false);
  const cardViewStartedAtRef = useRef<{
    achievementId: string;
    startedAt: number;
  } | null>(null);
  // Requests are deliberately serialized, but never sit on the gesture path.
  // That keeps a quick undo ordered after its original action without making
  // the next card wait for a network round-trip.
  const feedRequestQueueRef = useRef<Promise<void>>(Promise.resolve());

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const thresholdHapticSeen = useSharedValue(false);
  const canUndo = useSharedValue(false);
  const undoProgress = useSharedValue(0);
  const dismissProgress = useSharedValue(0);

  const current = items[0];
  const next = items[1];
  const currentId = current?.id;
  // The leaving card belongs to the outgoing layer. State updates can
  // momentarily leave it as `current` as well, so never mount it twice.
  const currentIsLeaving = current?.id === dismissOverlay?.id;
  const previous = history.at(-1)?.achievement;
  const restoreCard = undoOverlay ?? previous;
  const horizontalThreshold = Math.max(88, width * 0.26);
  const verticalThreshold = Math.max(98, Math.min(160, height * 0.18));
  const cardTop = insets.top + 58;
  const cardWidth = width - spacing.md * 2;
  const barBottom = Math.max(insets.bottom, patchLayout.tabBarBottomOffset);
  const tabBarTop = height - barBottom - patchLayout.tabBarHeight;
  const cardBottom = cardTop + currentCardHeight;
  const mascotGap = Math.max(0, tabBarTop - cardBottom);
  const mascotSize = Math.min(96, Math.max(36, mascotGap - 16));
  const mascotTop = cardBottom + Math.max(8, (mascotGap - mascotSize) / 2);

  useEffect(() => {
    if (!socialEnabled || feed !== "friends") return;
    const handle = setTimeout(() => setMode("friends"), 0);
    return () => clearTimeout(handle);
  }, [feed, socialEnabled]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    cardViewStartedAtRef.current = currentId
      ? { achievementId: currentId, startedAt: Date.now() }
      : null;
  }, [currentId]);

  useEffect(() => {
    historyRef.current = history;
    canUndo.value = history.length > 0;
  }, [canUndo, history]);

  useEffect(() => {
    authorTapBoundsRef.current = null;
    descriptionTapBoundsRef.current = null;
    descriptionToggleRef.current = null;
  }, [current?.id]);

  const loadFirstPage = useCallback(async () => {
    if (!session) return;
    loadedRef.current = true;
    setLoading(true);
    setMessage(null);
    try {
      const page = friendsMode
        ? {
            items: await getFriendFeed(pageSize),
            nextCursor: null,
            hasMore: false,
          }
        : await getDiscoverFeed(null, pageSize);
      itemsRef.current = page.items;
      nextCursorRef.current = page.nextCursor;
      hasMoreRef.current = page.hasMore;
      setItems(page.items);
      setHistory([]);
    } catch {
      loadedRef.current = false;
      setMessage(
        friendsMode
          ? "Could not load friends’ Patches. Try again."
          : "Could not load recommendations. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [friendsMode, session]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || !nextCursorRef.current)
      return;
    loadingMoreRef.current = true;
    try {
      const page = await getDiscoverFeed(nextCursorRef.current, pageSize);
      nextCursorRef.current = page.nextCursor;
      hasMoreRef.current = page.hasMore;
      setItems((existing) => {
        const existingIds = new Set(existing.map((item) => item.id));
        const nextItems = [
          ...existing,
          ...page.items.filter((item) => !existingIds.has(item.id)),
        ];
        itemsRef.current = nextItems;
        return nextItems;
      });
    } catch {
      setMessage(
        "Could not load more recommendations. Keep swiping or try again.",
      );
    } finally {
      loadingMoreRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (items.length <= 3) void loadMore();
  }, [items.length, loadMore]);

  useEffect(() => {
    const art = items
      .slice(1, 3)
      .flatMap((item) => (item.cover_url ? [item.cover_url] : []));
    if (art.length) void Image.prefetch(art, "memory-disk");
  }, [items]);

  useFocusEffect(
    useCallback(() => {
      if (!loadedRef.current) {
        void loadFirstPage();
      }
    }, [loadFirstPage]),
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      loadedRef.current = false;
      nextCursorRef.current = null;
      hasMoreRef.current = !friendsMode;
      setItems([]);
      setHistory([]);
      void loadFirstPage();
    }, 0);
    return () => clearTimeout(handle);
  }, [friendsMode, loadFirstPage]);

  const restartRecommendations = useCallback(async () => {
    setMutating(true);
    setMessage(null);
    try {
      if (!friendsMode) await resetDiscoverRecommendations();
      loadedRef.current = false;
      nextCursorRef.current = null;
      hasMoreRef.current = true;
      await loadFirstPage();
    } catch {
      setMessage("Could not restart recommendations. Try again.");
    } finally {
      setMutating(false);
    }
  }, [friendsMode, loadFirstPage]);

  const notifyThreshold = useCallback((direction: SwipeDirection) => {
    void Haptics.impactAsync(
      direction === "right"
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );
  }, []);

  const enqueueFeedRequest = useCallback(
    <Result,>(request: () => Promise<Result>) => {
      const queued = feedRequestQueueRef.current.then(request);
      feedRequestQueueRef.current = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
    },
    [],
  );

  const reportFeedSyncFailure = useCallback((message: string) => {
    // Do not pull the deck backwards after the person has already continued
    // swiping. The next focus refresh reconciles the optimistic deck instead.
    loadedRef.current = false;
    setMessage(message);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, []);

  const queueFeedOperation = useCallback(
    async (
      operationType: "apply_discover_action" | "undo_discover_action",
      achievementId: string,
      action: FeedAction | null,
      operationId: string,
    ) => {
      await enqueue({
        id: createOperationId(),
        operationType,
        idempotencyKey: operationId,
        payload: {
          rpcName:
            operationType === "apply_discover_action"
              ? "apply_discover_feedback_v2"
              : "undo_discover_feedback_v2",
          args:
            operationType === "apply_discover_action"
              ? { p_achievement_id: achievementId, p_action: action }
              : { p_achievement_id: achievementId },
        },
      });
    },
    [enqueue],
  );

  const queueDiscoverEngagement = useCallback(
    async (
      achievementId: string,
      eventType: "profile_open" | "view",
      operationId: string,
      durationMs?: number,
    ) => {
      await enqueue({
        id: createOperationId(),
        operationType: "record_discover_engagement",
        idempotencyKey: operationId,
        payload: {
          rpcName: "record_discover_engagement_v1",
          args: {
            p_achievement_id: achievementId,
            p_event_type: eventType,
            p_duration_ms: durationMs,
          },
        },
      });
    },
    [enqueue],
  );

  const trackDiscoverEngagement = useCallback(
    (
      achievementId: string,
      eventType: "profile_open" | "view",
      durationMs?: number,
    ) => {
      const operationId = createOperationId();
      void enqueueFeedRequest(() =>
        recordDiscoverEngagement(
          achievementId,
          eventType,
          operationId,
          durationMs,
        ),
      ).catch(() => {
        // Engagement is useful for future ranking, but never blocks browsing.
        void queueDiscoverEngagement(
          achievementId,
          eventType,
          operationId,
          durationMs,
        ).catch(() => undefined);
      });
    },
    [enqueueFeedRequest, queueDiscoverEngagement],
  );

  const recordCurrentCardView = useCallback(
    (achievement: Achievement) => {
      const started = cardViewStartedAtRef.current;
      if (!started || started.achievementId !== achievement.id) return;
      cardViewStartedAtRef.current = null;
      const durationMs = Date.now() - started.startedAt;
      // Fast swipes already carry an explicit skip/not-for-me signal. Do not
      // turn a sub-second glance into a competing view-preference event.
      if (durationMs >= 1000)
        trackDiscoverEngagement(achievement.id, "view", durationMs);
    },
    [trackDiscoverEngagement],
  );

  const applyPendingCardHeight = useCallback(() => {
    if (pendingCardHeightRef.current > 0) {
      setCurrentCardHeight(pendingCardHeightRef.current);
    }
  }, []);

  const settleUndo = useCallback(() => {
    // The restored card already exists below the restore overlay. Switch that
    // card to its neutral presentation in the same React commit that removes
    // the overlay, then clear transition-only values on the following frame.
    translateX.value = 0;
    translateY.value = 0;
    setUndoOverlay(null);
    setUndoCommitting(false);
    applyPendingCardHeight();
    requestAnimationFrame(() => {
      undoProgress.value = 0;
      setMutating(false);
    });
  }, [applyPendingCardHeight, translateX, translateY, undoProgress]);

  const completeUndoAnimation = useCallback(
    (
      entry: HistoryEntry,
      snapshot: Achievement[],
      historySnapshot: HistoryEntry[],
    ) => {
      const nextHistory = historySnapshot.slice(0, -1);
      const nextItems = [entry.achievement, ...snapshot];
      historyRef.current = nextHistory;
      itemsRef.current = nextItems;
      canUndo.value = nextHistory.length > 0;
      setHistory(nextHistory);
      setItems(nextItems);
      // The restore is visual and immediate. Keeping it coupled to the RPC
      // made the deck feel locked for a full network round-trip.
      settleUndo();

      void enqueueFeedRequest(() =>
        undoDiscoverFeedAction(entry.achievement.id, entry.operationId),
      )
        .then((result) => {
          setItems((value) =>
            value.map((item) =>
              item.id === entry.achievement.id
                ? { ...item, like_count: result.like_count }
                : item,
            ),
          );
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        })
        .catch(() => {
          void queueFeedOperation(
            "undo_discover_action",
            entry.achievement.id,
            null,
            entry.operationId,
          ).catch(() => {
            reportFeedSyncFailure(
              "Could not save that restore. Try again when online.",
            );
          });
          setMessage("Restore saved. It will sync when you are back online.");
        });
    },
    [
      canUndo,
      enqueueFeedRequest,
      queueFeedOperation,
      reportFeedSyncFailure,
      settleUndo,
    ],
  );

  const settleDismissSuccess = useCallback(() => {
    if (!dismissAnimationDoneRef.current || !dismissStateReadyRef.current)
      return;
    dismissAnimationDoneRef.current = false;
    dismissStateReadyRef.current = false;
    // The outgoing overlay is already off-screen and the incoming card has
    // reached its full presentation. Reset the neutral card pose before the
    // overlay is removed so the data-key change cannot flash at the old offset.
    translateX.value = 0;
    translateY.value = 0;
    setDismissOverlay(null);
    setDismissDirection(null);
    applyPendingCardHeight();
    requestAnimationFrame(() => {
      dismissProgress.value = 0;
      setMutating(false);
    });
  }, [applyPendingCardHeight, dismissProgress, translateX, translateY]);

  const completeDismissAnimation = useCallback(
    (direction: DismissDirection) => {
      dismissAnimationDoneRef.current = true;
      void Haptics.notificationAsync(
        direction === "right"
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );
      settleDismissSuccess();
    },
    [settleDismissSuccess],
  );

  const startDismissAnimation = useCallback(
    (direction: DismissDirection) => {
      "worklet";
      const startProgress = Math.min(
        1,
        Math.max(
          Math.abs(translateX.value) / horizontalThreshold,
          Math.max(0, -translateY.value) / verticalThreshold,
        ),
      );
      const targetX =
        direction === "right"
          ? width * 1.22
          : direction === "left"
            ? -width * 1.22
            : 0;
      const targetY = direction === "up" ? -height * 1.08 : 8;
      const finish = (done?: boolean) => {
        "worklet";
        if (done) runOnJS(completeDismissAnimation)(direction);
      };

      dismissProgress.value = startProgress;
      if (reducedMotion) {
        dismissProgress.value = withTiming(1, { duration: 1 });
        translateX.value = withTiming(targetX, { duration: 1 });
        translateY.value = withTiming(targetY, { duration: 1 }, finish);
        return;
      }

      // Start the departure on the UI thread at finger release. React updates
      // and the feedback request then run alongside it instead of blocking the
      // final visible part of the flight on the JS thread.
      const config = {
        duration: swipeSettleDuration,
        easing: Easing.out(Easing.quad),
      };
      dismissProgress.value = withTiming(1, config);
      translateX.value = withTiming(targetX, config);
      translateY.value = withTiming(targetY, config, finish);
    },
    [
      completeDismissAnimation,
      dismissProgress,
      height,
      horizontalThreshold,
      reducedMotion,
      translateX,
      translateY,
      verticalThreshold,
      width,
    ],
  );

  const finishSwipe = useCallback(
    (direction: SwipeDirection, velocityX: number, velocityY: number) => {
      const snapshot = itemsRef.current;
      const currentItem = snapshot[0];
      if (!currentItem || mutating) {
        translateX.value = 0;
        translateY.value = 0;
        return;
      }

      setMessage(null);
      if (direction !== "down") {
        recordCurrentCardView(currentItem);
        void trackProductEvent("reaction", currentItem.id, "discover").catch(
          () => undefined,
        );
      }

      if (direction === "down") {
        const entry = historyRef.current.at(-1);
        if (!entry) {
          translateX.value = withSpring(
            0,
            { damping: 18, stiffness: 210 },
            (done) => {
              if (done) runOnJS(setMutating)(false);
            },
          );
          translateY.value = withSpring(0, { damping: 18, stiffness: 210 });
          return;
        }
        const historySnapshot = historyRef.current;
        const startProgress = Math.min(
          1,
          Math.max(0, translateY.value / verticalThreshold),
        );
        setMutating(true);
        setUndoCommitting(true);
        setUndoOverlay(entry.achievement);
        undoProgress.value = startProgress;
        translateX.value = reducedMotion
          ? withTiming(0, { duration: 1 })
          : withSpring(0, {
              damping: 20,
              stiffness: 220,
              velocity: velocityX,
            });
        undoProgress.value = reducedMotion
          ? withTiming(1, { duration: 1 }, (done) => {
              if (done)
                runOnJS(completeUndoAnimation)(
                  entry,
                  snapshot,
                  historySnapshot,
                );
            })
          : withTiming(
              1,
              {
                duration: swipeSettleDuration,
                easing: Easing.out(Easing.cubic),
              },
              (done) => {
                if (done)
                  runOnJS(completeUndoAnimation)(
                    entry,
                    snapshot,
                    historySnapshot,
                  );
              },
            );
        return;
      }

      setMutating(true);
      dismissStateReadyRef.current = true;
      const action = feedbackForSwipe(direction);
      const operationId = createOperationId();
      const entry: HistoryEntry = {
        achievement: currentItem,
        action,
        operationId,
      };
      const historySnapshot = historyRef.current;
      const nextItems = snapshot.slice(1);
      const nextHistory = [...historySnapshot, entry];
      // Keep the synchronous gesture source aligned with the optimistic deck.
      // Waiting for React effects here made the next gesture resolve against
      // the departed card and look like the swipe had been ignored.
      itemsRef.current = nextItems;
      historyRef.current = nextHistory;
      canUndo.value = true;
      setDismissOverlay(currentItem);
      setDismissDirection(direction);
      setItems(nextItems);
      setHistory(nextHistory);
      // A very slow JS frame can finish the UI animation first. In that case,
      // settle immediately after installing the visual state instead of
      // leaving the deck locked behind a completed off-screen card.
      settleDismissSuccess();
      void enqueueFeedRequest(() =>
        applyDiscoverFeedAction(currentItem.id, action, operationId),
      ).catch(() => {
        void queueFeedOperation(
          "apply_discover_action",
          currentItem.id,
          action,
          operationId,
        ).catch(() => {
          reportFeedSyncFailure(
            "Could not save that choice. Try again when online.",
          );
        });
        setMessage("Choice saved. It will sync when you are back online.");
      });
    },
    [
      completeUndoAnimation,
      canUndo,
      enqueueFeedRequest,
      mutating,
      reducedMotion,
      reportFeedSyncFailure,
      recordCurrentCardView,
      queueFeedOperation,
      settleDismissSuccess,
      translateX,
      translateY,
      undoProgress,
      verticalThreshold,
    ],
  );

  const handleCardTap = useCallback(
    (x: number, y: number) => {
      const hits = (bounds: TapBounds | null) =>
        bounds &&
        x >= bounds.x &&
        x <= bounds.x + bounds.width &&
        y >= bounds.y &&
        y <= bounds.y + bounds.height;
      if (hits(authorTapBoundsRef.current) && current) {
        trackDiscoverEngagement(current.id, "profile_open");
        router.push(`/user/${current.owner_id}`);
        return;
      }
      if (hits(descriptionTapBoundsRef.current)) {
        descriptionToggleRef.current?.();
        return;
      }
      if (current) router.push(`/achievement/${current.id}`);
    },
    [current, trackDiscoverEngagement],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!mutating && Boolean(current))
        .minDistance(4)
        .onBegin(() => {
          thresholdHapticSeen.value = false;
        })
        .onUpdate((event) => {
          translateX.value = event.translationX;
          translateY.value = event.translationY;
          const direction = previewSwipeDirection(
            event.translationX,
            event.translationY,
            Math.min(horizontalThreshold, verticalThreshold) * 0.78,
            canUndo.value,
          );
          if (direction && !thresholdHapticSeen.value) {
            thresholdHapticSeen.value = true;
            runOnJS(notifyThreshold)(direction);
          }
        })
        .onEnd((event) => {
          const direction = resolveSwipeDirection(
            event.translationX,
            event.translationY,
            event.velocityX,
            event.velocityY,
            horizontalThreshold,
            verticalThreshold,
            canUndo.value,
          );
          if (!direction) {
            translateX.value = withSpring(0, {
              damping: 20,
              stiffness: 220,
              velocity: event.velocityX,
            });
            translateY.value = withSpring(0, {
              damping: 20,
              stiffness: 220,
              velocity: event.velocityY,
            });
            return;
          }
          if (direction !== "down") startDismissAnimation(direction);
          runOnJS(finishSwipe)(direction, event.velocityX, event.velocityY);
        }),
    [
      canUndo,
      current,
      finishSwipe,
      horizontalThreshold,
      mutating,
      notifyThreshold,
      startDismissAnimation,
      thresholdHapticSeen,
      translateX,
      translateY,
      verticalThreshold,
    ],
  );

  const cardTap = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(8)
        .maxDuration(260)
        .onEnd((event, success) => {
          if (success) runOnJS(handleCardTap)(event.x, event.y);
        }),
    [handleCardTap],
  );
  const cardGesture = useMemo(
    // A pan activates as soon as movement clears its threshold. The tap only
    // resolves on release, so this race makes movement win from every card
    // sub-area (including artwork, author, and the description).
    () => Gesture.Race(pan, cardTap),
    [cardTap, pan],
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View accessibilityRole="tablist" style={styles.modeRow}>
          <View style={styles.modeCluster}>
            <ModeButton
              active={!friendsMode}
              label="For you"
              onPress={() => {
                if (mode !== "for-you") setMode("for-you");
                else if (!loadedRef.current) void loadFirstPage();
              }}
            />
            {socialEnabled ? (
              <>
                <Text accessibilityElementsHidden style={styles.separator}>
                  |
                </Text>
                <ModeButton
                  active={friendsMode}
                  label="Friends"
                  onPress={() => {
                    if (mode !== "friends") setMode("friends");
                  }}
                />
              </>
            ) : null}
          </View>
          <View style={styles.headerActions}>
            {socialEnabled ? (
              <HeaderIcon
                icon="magnify"
                label="Search travelers"
                dark
                onPress={() => router.push("/people-search")}
              />
            ) : null}
            <NotificationButton />
          </View>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={palette.blue}
          style={styles.center}
        />
      ) : !current && !dismissOverlay ? (
        <View style={styles.center}>
          <EmptyState
            icon={friendsMode ? "account-group-outline" : "compass-off-outline"}
            title={friendsMode ? "No friends’ Patches yet" : "You caught up"}
            body={
              friendsMode
                ? "Add friends to see their public Patches in this deck."
                : "Start a fresh round or come back when new Patches arrive."
            }
          />
          {!friendsMode ? (
            <Pressable
              accessibilityRole="button"
              disabled={mutating}
              onPress={() => void restartRecommendations()}
              style={({ pressed }) => [
                styles.reload,
                (pressed || mutating) && styles.pressed,
              ]}
            >
              <Text style={styles.reloadText}>Show recommendations again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View
          pointerEvents={mutating || undoCommitting ? "none" : "auto"}
          style={[styles.deck, { top: cardTop, width: cardWidth }]}
        >
          {next ? (
            <FeedCard
              key={`next-${next.id}`}
              achievement={next}
              kind="next"
              translateX={translateX}
              translateY={translateY}
              horizontalThreshold={horizontalThreshold}
              verticalThreshold={verticalThreshold}
              dismissActive={Boolean(dismissOverlay)}
            />
          ) : null}
          {current && !currentIsLeaving ? (
            <GestureDetector gesture={cardGesture}>
              <Animated.View style={styles.currentGestureLayer}>
                <FeedCard
                  key={`current-${current.id}`}
                  achievement={current}
                  kind="current"
                  translateX={translateX}
                  translateY={translateY}
                  horizontalThreshold={horizontalThreshold}
                  verticalThreshold={verticalThreshold}
                  undoProgress={undoProgress}
                  undoActive={Boolean(undoOverlay)}
                  dismissProgress={dismissProgress}
                  dismissActive={Boolean(dismissOverlay)}
                  canRestore={Boolean(restoreCard)}
                  onLayout={(event) => {
                    const nextHeight = event.nativeEvent.layout.height;
                    pendingCardHeightRef.current = nextHeight;
                    if (!dismissOverlay && !undoCommitting) {
                      setCurrentCardHeight(nextHeight);
                    }
                  }}
                  onAuthorLayout={(bounds) => {
                    authorTapBoundsRef.current = bounds;
                  }}
                  onDescriptionToggleLayout={(bounds) => {
                    descriptionTapBoundsRef.current = bounds;
                  }}
                  onDescriptionToggleReady={(toggle) => {
                    descriptionToggleRef.current = toggle;
                  }}
                />
              </Animated.View>
            </GestureDetector>
          ) : null}
          {dismissOverlay && dismissDirection ? (
            <FeedCard
              key={`dismiss-${dismissOverlay.id}`}
              achievement={dismissOverlay}
              kind="outgoing"
              translateX={translateX}
              translateY={translateY}
              horizontalThreshold={horizontalThreshold}
              verticalThreshold={verticalThreshold}
              dismissProgress={dismissProgress}
            />
          ) : null}
          {restoreCard ? (
            <FeedCard
              key={`restore-${restoreCard.id}`}
              achievement={restoreCard}
              kind="restore"
              translateX={translateX}
              translateY={translateY}
              horizontalThreshold={horizontalThreshold}
              verticalThreshold={verticalThreshold}
              undoProgress={undoProgress}
              undoActive={Boolean(undoOverlay)}
            />
          ) : null}
          {!dismissOverlay && !undoCommitting ? (
            <>
              <SwipeFeedback
                direction="right"
                translateX={translateX}
                translateY={translateY}
                horizontalThreshold={horizontalThreshold}
                verticalThreshold={verticalThreshold}
              />
              <SwipeFeedback
                direction="left"
                translateX={translateX}
                translateY={translateY}
                horizontalThreshold={horizontalThreshold}
                verticalThreshold={verticalThreshold}
              />
              <SwipeFeedback
                direction="up"
                translateX={translateX}
                translateY={translateY}
                horizontalThreshold={horizontalThreshold}
                verticalThreshold={verticalThreshold}
              />
              {previous ? (
                <SwipeFeedback
                  direction="down"
                  translateX={translateX}
                  translateY={translateY}
                  horizontalThreshold={horizontalThreshold}
                  verticalThreshold={verticalThreshold}
                />
              ) : null}
            </>
          ) : null}
        </View>
      )}

      <View
        pointerEvents="none"
        style={[
          styles.mascotSlot,
          {
            top: mascotTop,
            height: mascotSize,
            opacity: currentCardHeight > 0 && mascotGap >= 52 ? 1 : 0,
          },
        ]}
      >
        <AnimatedMascot
          size={mascotSize}
          variant={loading ? "search" : current ? "welcome" : "celebrate"}
        />
      </View>

      {message ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          onPress={() => setMessage(null)}
          style={[styles.message, { bottom: Math.max(insets.bottom, 16) + 74 }]}
        >
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={18}
            color={palette.white}
          />
          <Text style={styles.messageText}>{message}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ModeButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={styles.modeButton}
    >
      <Text style={[styles.modeText, active && styles.modeTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function FeedCard({
  achievement,
  kind,
  translateX,
  translateY,
  horizontalThreshold,
  verticalThreshold,
  undoProgress,
  undoActive = false,
  dismissProgress,
  dismissActive = false,
  canRestore = false,
  onLayout,
  onAuthorLayout,
  onDescriptionToggleLayout,
  onDescriptionToggleReady,
}: {
  achievement: Achievement;
  kind: "current" | "next" | "outgoing" | "restore";
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  horizontalThreshold: number;
  verticalThreshold: number;
  undoProgress?: SharedValue<number>;
  undoActive?: boolean;
  dismissProgress?: SharedValue<number>;
  dismissActive?: boolean;
  canRestore?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  onAuthorLayout?: (bounds: TapBounds) => void;
  onDescriptionToggleLayout?: (bounds: TapBounds) => void;
  onDescriptionToggleReady?: (toggle: () => void) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [descriptionTruncated, setDescriptionTruncated] = useState(false);
  const toggleExpanded = useCallback(() => {
    setExpanded((value) => !value);
  }, []);
  const descriptionBlockBoundsRef = useRef<TapBounds | null>(null);
  const descriptionToggleBoundsRef = useRef<TapBounds | null>(null);
  const reportDescriptionToggleBounds = useCallback(() => {
    const block = descriptionBlockBoundsRef.current;
    const toggle = descriptionToggleBoundsRef.current;
    if (!block || !toggle || !onDescriptionToggleLayout) return;
    onDescriptionToggleLayout({
      x: block.x + toggle.x + spacing.md,
      y: block.y + toggle.y + spacing.md,
      width: toggle.width,
      height: toggle.height,
    });
  }, [onDescriptionToggleLayout]);
  const animatedStyle = useAnimatedStyle(() => {
    const absX = Math.abs(translateX.value);
    const absY = Math.abs(translateY.value);
    const horizontalDominant = absX >= absY;
    const horizontalProgress = horizontalDominant
      ? Math.min(1, absX / horizontalThreshold)
      : 0;
    const upwardProgress =
      !horizontalDominant && translateY.value < 0
        ? Math.min(1, -translateY.value / verticalThreshold)
        : 0;
    const downwardProgress =
      !horizontalDominant && translateY.value > 0
        ? Math.min(1, translateY.value / verticalThreshold)
        : 0;
    const forwardProgress = Math.max(horizontalProgress, upwardProgress);

    if (kind === "next") {
      const progress = dismissActive ? 0 : forwardProgress;
      return {
        opacity: 0.38 + progress * 0.62,
        transform: [
          { translateY: (1 - progress) * 18 },
          { scale: 0.95 + progress * 0.05 },
        ],
      };
    }
    if (kind === "restore") {
      const progress = undoActive
        ? (undoProgress?.value ?? 0)
        : downwardProgress;
      return {
        opacity: progress,
        transform: [
          { translateY: -48 + progress * 48 },
          { scale: 0.965 + progress * 0.035 },
        ],
      };
    }
    if (kind === "outgoing") {
      const progress = dismissProgress?.value ?? forwardProgress;
      return {
        opacity: interpolate(progress, [0, 1], [1, 0.9], Extrapolation.CLAMP),
        transform: [
          { translateX: translateX.value },
          { translateY: translateY.value },
          {
            rotate: `${interpolate(
              translateX.value,
              [-horizontalThreshold * 1.5, 0, horizontalThreshold * 1.5],
              [-5, 0, 5],
              Extrapolation.CLAMP,
            )}deg`,
          },
          { scale: 1 - progress * 0.012 },
        ],
      };
    }

    if (dismissActive && dismissProgress) {
      const progress = dismissProgress.value;
      return {
        opacity: 0.38 + progress * 0.62,
        transform: [
          { translateY: (1 - progress) * 18 },
          { scale: 0.95 + progress * 0.05 },
        ],
      };
    }

    if (undoActive && undoProgress) {
      const progress = undoProgress.value;
      return {
        opacity: 1 - progress * 0.42,
        transform: [
          { translateY: progress * 18 },
          { scale: 1 - progress * 0.05 },
        ],
      };
    }

    if (canRestore && downwardProgress > 0) {
      return {
        opacity: 1 - downwardProgress * 0.42,
        transform: [
          { translateY: downwardProgress * 18 },
          { scale: 1 - downwardProgress * 0.05 },
        ],
      };
    }

    return {
      opacity: interpolate(
        forwardProgress,
        [0, 1],
        [1, 0.85],
        Extrapolation.CLAMP,
      ),
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        {
          rotate: `${interpolate(
            translateX.value,
            [-horizontalThreshold * 1.5, 0, horizontalThreshold * 1.5],
            [-5, 0, 5],
            Extrapolation.CLAMP,
          )}deg`,
        },
        {
          scale: interpolate(
            forwardProgress,
            [0, 1],
            [1, 0.985],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents={kind === "current" ? "auto" : "none"}
      onLayout={onLayout}
      style={[
        styles.cardBase,
        kind === "current" ? styles.currentCard : styles.backCard,
        animatedStyle,
      ]}
    >
      <View style={styles.cardContent}>
        <View
          accessibilityRole="button"
          accessibilityLabel={`Open ${achievement.owner?.display_name ?? "Patch traveler"} profile`}
          onLayout={(event) => {
            const { x, y, width, height } = event.nativeEvent.layout;
            onAuthorLayout?.({
              x: x + spacing.md,
              y: y + spacing.md,
              width,
              height,
            });
          }}
          style={styles.author}
        >
          <Avatar size={34} avatarKey={achievement.owner?.avatar_key} />
          <View style={styles.authorCopy}>
            <Text numberOfLines={1} style={styles.authorName}>
              {achievement.owner?.display_name ?? "Patch traveler"}
            </Text>
            <Text numberOfLines={1} style={styles.handle}>
              @{achievement.owner?.username ?? "patch"}
            </Text>
          </View>
        </View>
        <View
          accessibilityRole="button"
          accessibilityLabel={`Open ${achievement.title}`}
          style={styles.titlePressable}
        >
          <Text numberOfLines={2} style={styles.title}>
            {achievement.title}
          </Text>
        </View>
        {achievement.description ? (
          <View
            onLayout={(event) => {
              descriptionBlockBoundsRef.current = event.nativeEvent.layout;
              reportDescriptionToggleBounds();
            }}
            style={styles.descriptionBlock}
          >
            <Text
              numberOfLines={expanded ? undefined : 2}
              onTextLayout={(event) => {
                if (!expanded)
                  setDescriptionTruncated(event.nativeEvent.lines.length > 2);
              }}
              style={styles.description}
            >
              {achievement.description}
            </Text>
            {descriptionTruncated ? (
              <View
                accessibilityRole="button"
                accessibilityLabel={
                  expanded ? "Show less description" : "View more description"
                }
                onLayout={(event) => {
                  descriptionToggleBoundsRef.current = event.nativeEvent.layout;
                  onDescriptionToggleReady?.(toggleExpanded);
                  reportDescriptionToggleBounds();
                }}
                style={styles.descriptionToggle}
              >
                <Text style={styles.descriptionToggleText}>
                  {expanded ? "Show less" : "View more"}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <View
          accessibilityRole="button"
          accessibilityLabel={`Open ${achievement.title}`}
          style={styles.artPressable}
        >
          <AchievementArt achievement={achievement} style={styles.art} />
        </View>
        <View style={styles.likes}>
          <MaterialCommunityIcons
            name="heart-outline"
            size={17}
            color={palette.inkMuted}
          />
          <Text style={styles.likesText}>
            {achievement.like_count}{" "}
            {achievement.like_count === 1 ? "like" : "likes"}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

function SwipeFeedback({
  direction,
  translateX,
  translateY,
  horizontalThreshold,
  verticalThreshold,
}: {
  direction: SwipeDirection;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  horizontalThreshold: number;
  verticalThreshold: number;
}) {
  const outcome = outcomeForDirection(direction);
  const animatedStyle = useAnimatedStyle(() => {
    const horizontal = Math.min(
      1,
      Math.abs(translateX.value) / horizontalThreshold,
    );
    const upward = Math.min(
      1,
      Math.max(0, -translateY.value) / verticalThreshold,
    );
    const downward = Math.min(
      1,
      Math.max(0, translateY.value) / verticalThreshold,
    );
    const matches =
      direction === "right"
        ? translateX.value > 0
          ? horizontal
          : 0
        : direction === "left"
          ? translateX.value < 0
            ? horizontal
            : 0
          : direction === "up"
            ? upward
            : downward;
    return {
      opacity: interpolate(
        matches,
        [0, 0.18, 1],
        [0, 0.18, 1],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          scale: interpolate(
            matches,
            [0, 1],
            [0.82, 1.05],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.feedback, animatedStyle]}
    >
      <MaterialCommunityIcons
        name={outcome.icon}
        size={42}
        color={outcome.color}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: "rgba(9,20,31,0.96)",
  },
  modeRow: {
    height: 58,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  modeCluster: { flexDirection: "row", alignItems: "center" },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    position: "absolute",
    right: spacing.sm,
  },
  modeButton: {
    minWidth: 86,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  modeText: {
    color: palette.inkMuted,
    fontFamily: type.rounded,
    fontSize: 17,
    fontWeight: "900",
  },
  modeTextActive: { color: palette.white },
  separator: {
    color: "rgba(178, 198, 214, 0.58)",
    fontSize: 18,
    fontWeight: "700",
  },
  center: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "38%",
    alignItems: "center",
  },
  reload: {
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  reloadText: { color: palette.blue, fontWeight: "800" },
  deck: { position: "absolute", left: spacing.md, zIndex: 20 },
  currentGestureLayer: { position: "relative", width: "100%" },
  cardBase: {
    width: "100%",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 12,
    overflow: "hidden",
    borderRadius: radius.xl,
    backgroundColor: palette.surface,
    shadowColor: "#020D16",
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  currentCard: { position: "relative" },
  backCard: { position: "absolute", top: 0, right: 0, left: 0 },
  cardContent: {},
  author: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  authorCopy: { flex: 1, minWidth: 0 },
  authorName: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 13,
    fontWeight: "900",
  },
  handle: { marginTop: 1, color: palette.inkMuted, fontSize: 10 },
  title: {
    color: palette.ink,
    fontFamily: type.rounded,
    fontSize: 21,
    lineHeight: 24,
    fontWeight: "900",
    letterSpacing: -0.35,
  },
  titlePressable: {
    minHeight: 40,
    marginTop: spacing.sm,
    justifyContent: "center",
  },
  descriptionBlock: { marginTop: 5, minHeight: 32 },
  description: {
    color: palette.inkMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  descriptionToggle: {
    alignSelf: "flex-start",
    minHeight: 24,
    justifyContent: "center",
  },
  descriptionToggleText: {
    color: palette.blue,
    fontSize: 11,
    fontWeight: "900",
  },
  artPressable: { width: "100%", marginTop: spacing.sm },
  art: {
    width: "100%",
    borderRadius: radius.xl,
  },
  likes: {
    minHeight: 32,
    paddingTop: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  likesText: { color: palette.inkMuted, fontSize: 11, fontWeight: "800" },
  feedback: {
    position: "absolute",
    zIndex: 30,
    top: "42%",
    left: "50%",
    width: 52,
    height: 52,
    marginLeft: -26,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(177, 62, 77, 0.96)",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  messageText: {
    flex: 1,
    color: palette.white,
    fontSize: 12,
    fontWeight: "700",
  },
  mascotSlot: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.72 },
});
