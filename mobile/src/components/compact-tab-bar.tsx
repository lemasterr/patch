/* eslint-disable react-hooks/immutability -- Reanimated shared values are intentionally updated inside gesture worklets. */
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import {
  GlassContainer,
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { type BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { GlassSurface } from "@/components/glass-surface";
import { PatchMapIcon } from "@/components/patch-map-icon";
import { PatchStackIcon } from "@/components/patch-stack-icon";
import { patchLayout } from "@/constants/patch-layout";
import { palette } from "@/constants/theme";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);

const routeIcons: Record<string, IconName> = {
  create: "plus",
  collection: "view-grid-outline",
  profile: "account-circle-outline",
};

export function CompactTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [pressedRoute, setPressedRoute] = useState<string | null>(null);
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const canUseGlass =
    Platform.OS === "ios" &&
    isGlassEffectAPIAvailable() &&
    isLiquidGlassAvailable();
  const barWidth = Math.min(width - 40, 316);
  const focusedRouteKey = state.routes[state.index]?.key;
  const visualRouteKey = pressedRoute ?? focusedRouteKey;
  const visualIndex = Math.max(
    0,
    state.routes.findIndex((route) => route.key === visualRouteKey),
  );
  const itemWidth = (barWidth - 10) / state.routes.length;
  const lensWidth = Math.min(48, itemWidth - 6);
  const lensPosition = useSharedValue(state.index);
  const lensScale = useSharedValue(1);
  const dragStartX = useRef(0);
  const dragLastX = useRef(0);
  const dragActive = useRef(false);
  const suppressPress = useRef(false);
  const lastDragIndex = useRef(state.index);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (mounted) setReduceTransparency(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduceTransparency,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    lensPosition.value = reduceMotion
      ? withTiming(visualIndex, { duration: 1 })
      : withSpring(visualIndex, {
          damping: 19,
          stiffness: 210,
          mass: 0.82,
        });
  }, [lensPosition, reduceMotion, visualIndex]);

  const lensAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: lensPosition.value * itemWidth },
      { scale: lensScale.value },
    ],
  }));

  const navigateToIndex = useCallback(
    (index: number) => {
      const route = state.routes[index];
      if (!route) return;
      const focused = index === state.index;
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
    },
    [navigation, state.index, state.routes],
  );

  const previewIndex = useCallback(
    (index: number) => {
      const route = state.routes[index];
      if (!route) return;
      setPressedRoute(route.key);
      void Haptics.selectionAsync();
    },
    [state.routes],
  );

  const positionForX = useCallback(
    (x: number) =>
      Math.min(
        state.routes.length - 1,
        Math.max(0, (x - 5 - itemWidth / 2) / itemWidth),
      ),
    [itemWidth, state.routes.length],
  );

  const handleDragStart = useCallback((event: GestureResponderEvent) => {
    const x = event.nativeEvent.locationX;
    dragStartX.current = x;
    dragLastX.current = x;
    dragActive.current = false;
    suppressPress.current = false;
  }, []);

  const handleDragMove = useCallback(
    (event: GestureResponderEvent) => {
      const x = event.nativeEvent.locationX;
      dragLastX.current = x;
      if (!dragActive.current && Math.abs(x - dragStartX.current) < 5) return;
      if (!dragActive.current) {
        dragActive.current = true;
        suppressPress.current = true;
        lensScale.value = withSpring(1.1, {
          damping: 18,
          stiffness: 260,
        });
      }
      const position = positionForX(x);
      const index = Math.round(position);
      lensPosition.value = position;
      if (index !== lastDragIndex.current) {
        lastDragIndex.current = index;
        previewIndex(index);
      }
    },
    [lensPosition, lensScale, positionForX, previewIndex],
  );

  const handleDragEnd = useCallback(
    (_event: GestureResponderEvent) => {
      if (!dragActive.current) return;
      const index = Math.round(positionForX(dragLastX.current));
      dragActive.current = false;
      lensPosition.value = reduceMotion
        ? withTiming(index, { duration: 1 })
        : withSpring(index, {
            damping: 19,
            stiffness: 240,
          });
      lensScale.value = withSpring(1, {
        damping: 18,
        stiffness: 260,
      });
      navigateToIndex(index);
      setTimeout(() => {
        suppressPress.current = false;
        setPressedRoute(null);
      }, 80);
    },
    [lensPosition, lensScale, navigateToIndex, positionForX, reduceMotion],
  );

  const handleDragCancel = useCallback(() => {
    dragActive.current = false;
    suppressPress.current = false;
    setPressedRoute(null);
    lensScale.value = withSpring(1, { damping: 18, stiffness: 260 });
    lensPosition.value = reduceMotion
      ? withTiming(state.index, { duration: 1 })
      : withSpring(state.index, { damping: 19, stiffness: 230 });
  }, [lensPosition, lensScale, reduceMotion, state.index]);

  const shellStyle = [
    styles.shell,
    {
      width: barWidth,
      bottom: Math.max(insets.bottom, patchLayout.tabBarBottomOffset),
    },
  ];
  const hasNativeGlass = canUseGlass && !reduceTransparency;

  const content = (
    <View style={styles.items}>
      {state.routes.map((route, index) => {
        const focused = route.key === focusedRouteKey;
        const descriptor = descriptors[route.key];
        const label =
          descriptor.options.tabBarAccessibilityLabel ??
          descriptor.options.title ??
          route.name;
        const isCreate = route.name === "create";
        // The lens previews on touch-down, while icon color communicates only
        // the committed route. This avoids a rainbow of icons while dragging.
        const iconColor =
          route.name === "discover"
            ? "#8E989F"
            : focused
              ? palette.white
              : palette.inkMuted;
        const onPress = () => {
          if (!suppressPress.current) navigateToIndex(index);
        };

        return (
          <Pressable
            key={route.key}
            accessibilityLabel={label}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            onLongPress={() =>
              navigation.emit({ type: "tabLongPress", target: route.key })
            }
            onPress={onPress}
            onPressIn={() => {
              setPressedRoute(route.key);
              lensScale.value = withSpring(1.08, {
                damping: 18,
                stiffness: 260,
              });
            }}
            onPressOut={() => {
              if (dragActive.current) return;
              lensScale.value = withSpring(1, {
                damping: 18,
                stiffness: 260,
              });
              requestAnimationFrame(() => setPressedRoute(null));
            }}
            style={styles.item}
          >
            <View pointerEvents="none" style={styles.icon}>
              {route.name === "discover" ? (
                <PatchStackIcon active={focused} color={iconColor} size={24} />
              ) : route.name === "map" ? (
                <PatchMapIcon active={focused} color={iconColor} size={24} />
              ) : (
                <MaterialCommunityIcons
                  name={routeIcons[route.name] ?? "circle-outline"}
                  size={isCreate ? 25 : 22}
                  color={iconColor}
                />
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View
      onTouchCancel={handleDragCancel}
      onTouchStart={handleDragStart}
      onMoveShouldSetResponderCapture={(event) =>
        Math.abs(event.nativeEvent.locationX - dragStartX.current) >= 5
      }
      onResponderGrant={handleDragMove}
      onResponderMove={handleDragMove}
      onResponderRelease={handleDragEnd}
      onResponderTerminate={handleDragCancel}
      style={shellStyle}
    >
      {hasNativeGlass ? (
        <GlassContainer pointerEvents="none" spacing={8} style={styles.glass}>
          <GlassView
            colorScheme="dark"
            glassEffectStyle="clear"
            style={styles.glassShell}
          />
          <AnimatedGlassView
            colorScheme="dark"
            // Keep a distinct physical droplet instead of merging the selected
            // destination into the long tab-bar surface.
            isInteractive
            // Keep the selected destination as the same clear native material
            // as the bar. `regular` renders as a flat grey lozenge in a dark
            // app, while two clear views in the container merge as Liquid
            // Glass on current iOS releases.
            glassEffectStyle="clear"
            tintColor="rgba(234,246,255,0.12)"
            style={[
              styles.activeLens,
              {
                left: 5 + (itemWidth - lensWidth) / 2,
                width: lensWidth,
              },
              lensAnimatedStyle,
            ]}
          />
        </GlassContainer>
      ) : (
        <>
          <GlassSurface effect="clear" style={styles.glassShell} />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.fallbackLens,
              {
                left: 5 + (itemWidth - lensWidth) / 2,
                width: lensWidth,
              },
              lensAnimatedStyle,
            ]}
          />
        </>
      )}
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: "absolute",
    alignSelf: "center",
    height: patchLayout.tabBarHeight,
    borderRadius: patchLayout.tabBarHeight / 2,
  },
  glass: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  glassShell: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: patchLayout.tabBarHeight / 2,
  },
  items: {
    flex: 1,
    paddingHorizontal: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  item: {
    minWidth: 44,
    minHeight: 44,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  activeLens: {
    position: "absolute",
    top: 3,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(244,250,255,0.24)",
  },
  fallbackLens: {
    position: "absolute",
    top: 3,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(234,246,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(244,250,255,0.24)",
  },
  icon: { alignItems: "center", justifyContent: "center" },
});
