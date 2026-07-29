import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import mascotFound from "@/assets/images/patch-mascot-found.webp";
import mascotGreeting from "@/assets/images/patch-mascot-greeting.webp";
import mascotSearch from "@/assets/images/patch-mascot-search.webp";
import mascotStep from "@/assets/images/patch-mascot-step.webp";
import mascotWalk from "@/assets/images/patch-mascot-walk.webp";

type MascotVariant = "welcome" | "loading" | "search" | "celebrate";

const stills = {
  welcome: mascotGreeting,
  search: mascotSearch,
  celebrate: mascotFound,
} as const;

export function AnimatedMascot({
  size = 220,
  variant = "welcome",
  style,
}: {
  size?: number;
  variant?: MascotVariant;
  style?: StyleProp<ViewStyle>;
}) {
  const [bob] = useState(() => new Animated.Value(0));
  const [tilt] = useState(() => new Animated.Value(0));
  const isWalking = variant === "loading";
  const still =
    variant === "welcome"
      ? stills.welcome
      : variant === "search"
        ? stills.search
        : stills.celebrate;
  const accessibilityLabel = useMemo(
    () =>
      variant === "loading"
        ? "Patch explorer is getting things ready"
        : variant === "search"
          ? "Patch explorer is searching with a compass"
          : variant === "celebrate"
            ? "Patch explorer celebrates a discovery"
            : "Patch explorer welcomes you",
    [variant],
  );

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(bob, {
            toValue: isWalking ? -1 : variant === "celebrate" ? -8 : -4,
            duration: isWalking ? 520 : variant === "celebrate" ? 320 : 520,
            useNativeDriver: true,
          }),
          Animated.timing(tilt, {
            toValue: isWalking
              ? 0
              : variant === "search"
                ? 1
                : variant === "welcome"
                  ? -1
                  : 0,
            duration: isWalking ? 520 : variant === "celebrate" ? 320 : 520,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(bob, {
            toValue: 0,
            duration: isWalking ? 520 : variant === "celebrate" ? 320 : 520,
            useNativeDriver: true,
          }),
          Animated.timing(tilt, {
            toValue: isWalking
              ? 0
              : variant === "search"
                ? -1
                : variant === "welcome"
                  ? 1
                  : 0,
            duration: isWalking ? 520 : variant === "celebrate" ? 320 : 520,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(tilt, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
      bob.setValue(0);
      tilt.setValue(0);
    };
  }, [bob, isWalking, tilt, variant]);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[styles.root, { width: size, height: size }, style]}
    >
      <Animated.View
        style={[
          styles.frame,
          {
            transform: [
              { translateY: bob },
              {
                rotate: tilt.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: ["-2deg", "0deg", "2deg"],
                }),
              },
            ],
          },
        ]}
      >
        {isWalking ? (
          <LoadingMascot />
        ) : (
          <Image source={still} contentFit="contain" style={styles.image} />
        )}
      </Animated.View>
    </View>
  );
}

function LoadingMascot() {
  const [walkLoaded, setWalkLoaded] = useState(false);
  const [walkFailed, setWalkFailed] = useState(false);

  return (
    <>
      {!walkLoaded || walkFailed ? (
        <Image source={mascotStep} contentFit="contain" style={styles.image} />
      ) : null}
      {!walkFailed ? (
        <Image
          autoplay
          source={mascotWalk}
          contentFit="contain"
          style={[
            StyleSheet.absoluteFill,
            !walkLoaded && styles.preloadingImage,
          ]}
          onLoad={() => setWalkLoaded(true)}
          onError={() => setWalkFailed(true)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  frame: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  image: { width: "100%", height: "100%" },
  preloadingImage: { opacity: 0 },
});
