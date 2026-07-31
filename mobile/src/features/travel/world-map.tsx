/* eslint-disable react-hooks/immutability -- Reanimated shared values are intentionally mutated inside gesture worklets and controlled camera callbacks. */
import { memo, useCallback, useEffect, useMemo } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import {
  Gesture,
  GestureDetector,
  type GestureType,
} from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDecay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { G, Path } from "react-native-svg";

import {
  countableCountryCodes,
  statusMeta,
  WORLD_COUNTRY_TOTAL,
} from "@/features/travel/country-catalog";
import { countryBounds } from "@/features/travel/generated-country-bounds";
import { simplifiedWorldLocations } from "@/features/travel/generated-world-map";
import { MAP_HEIGHT, MAP_WIDTH } from "@/features/travel/map-geometry";
import type { MapFocus, TravelVisit } from "@/features/travel/types";

export type WorldLocation = (typeof simplifiedWorldLocations)[number];

// This is the only selectable world dataset. `@svg-maps/world` also contains
// territories; they are not part of Patch's 195-country travel count.
export const selectableWorldCountries = simplifiedWorldLocations.filter(
  (location) => countableCountryCodes.has(location.id.toUpperCase()),
);
export const worldCountries = selectableWorldCountries;
export const countryByCode = new Map(
  selectableWorldCountries.map((country) => [
    country.id.toUpperCase(),
    country,
  ]),
);

const AnimatedMapGroup = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const MIN_ZOOM = 0.88;
const MAX_ZOOM = 9;

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

function clampedAxis(center: number, size: number, zoom: number) {
  "worklet";
  const visibleSize = size / zoom;
  if (visibleSize >= size) return size / 2;
  return clamp(center, visibleSize / 2, size - visibleSize / 2);
}

function rubberBandAxis(center: number, size: number, zoom: number) {
  "worklet";
  const visibleSize = size / zoom;
  if (visibleSize >= size) {
    return size / 2 + (center - size / 2) * 0.16;
  }
  const min = visibleSize / 2;
  const max = size - visibleSize / 2;
  if (center < min) return min + (center - min) * 0.16;
  if (center > max) return max + (center - max) * 0.16;
  return center;
}

function clampedCenter(centerX: number, centerY: number, zoom: number) {
  "worklet";
  return {
    centerX: clampedAxis(centerX, MAP_WIDTH, zoom),
    centerY: clampedAxis(centerY, MAP_HEIGHT, zoom),
  };
}

function findCountryAtPoint(
  worldX: number,
  worldY: number,
  hitSlop: number,
): WorldLocation | null {
  const matches = worldCountries
    .flatMap((country) => {
      const bounds = countryBounds[country.id.toUpperCase()];
      if (!bounds) return [];
      const [minX, minY, maxX, maxY] = bounds;
      const isInside =
        worldX >= minX - hitSlop &&
        worldX <= maxX + hitSlop &&
        worldY >= minY - hitSlop &&
        worldY <= maxY + hitSlop;
      if (!isInside) return [];
      return [{ country, area: (maxX - minX) * (maxY - minY) }];
    })
    .sort((left, right) => left.area - right.area);

  return matches[0]?.country ?? null;
}

export type CountryVisualState = "unvisited" | TravelVisit["status"];

export type CountryPathBatch = {
  key: string;
  state: CountryVisualState;
  countryCodes: string[];
  d: string;
};

const CountryGeometryLayer = memo(function CountryGeometryLayer({
  batches,
}: {
  batches: CountryPathBatch[];
}) {
  return batches.map((batch) => (
    <Path
      key={batch.key}
      d={batch.d}
      fill={statusFill[batch.state]}
      stroke="#0A1722"
      strokeWidth={0.68}
    />
  ));
});

const MAX_BATCH_CHARACTERS = 32_000;
const countryStateOrder: CountryVisualState[] = [
  "unvisited",
  "wishlist",
  "visited",
  "lived",
];

/**
 * Normalizes a standalone legacy SVG fragment before it joins a compound path.
 * Generated production geometry is already absolute; keeping this helper also
 * makes the batching contract explicit for older fixtures.
 */
export function makePathIndependent(path: string) {
  const first = path.search(/\S/);
  if (first < 0) throw new Error("Country path is empty.");
  const command = path[first];
  if (command === "M") return path;
  if (command !== "m") {
    throw new Error(`Unexpected initial SVG command: ${command}`);
  }
  return `${path.slice(0, first)}M${path.slice(first + 1)}`;
}

/**
 * Builds bounded compound paths without changing country geometry. Batching
 * keeps the number of native SVG nodes small while avoiding a giant multi-MB
 * string that is expensive for Fabric to parse.
 */
export function buildCountryPathBatches(
  countries: readonly WorldLocation[],
  visitByCode: ReadonlyMap<string, TravelVisit>,
): CountryPathBatch[] {
  const byState: Record<CountryVisualState, WorldLocation[]> = {
    unvisited: [],
    wishlist: [],
    visited: [],
    lived: [],
  };

  for (const country of countries) {
    const state =
      visitByCode.get(country.id.toUpperCase())?.status ?? "unvisited";
    byState[state].push(country);
  }

  const batches: CountryPathBatch[] = [];
  for (const state of countryStateOrder) {
    let paths: string[] = [];
    let countryCodes: string[] = [];
    let characters = 0;
    let batchIndex = 0;
    const flush = () => {
      if (!paths.length || !countryCodes.length) return;
      const d = paths.join("\n");
      batches.push({
        key: `${state}-${batchIndex}-${countryCodes[0]}-${countryCodes.at(-1)}`,
        state,
        countryCodes,
        d,
      });
      batchIndex += 1;
      paths = [];
      countryCodes = [];
      characters = 0;
    };

    for (const country of byState[state]) {
      const path = makePathIndependent(country.path);
      // Do not split an SVG command stream: a long country (for example,
      // Canada) is still a valid one-country batch.
      if (paths.length && characters + path.length > MAX_BATCH_CHARACTERS) {
        flush();
      }
      paths.push(path);
      countryCodes.push(country.id.toUpperCase());
      characters += path.length;
    }
    flush();
  }
  return batches;
}

function validateWorldDataset() {
  if (!__DEV__) return;
  const codes = selectableWorldCountries.map((country) =>
    country.id.toUpperCase(),
  );
  if (codes.length !== WORLD_COUNTRY_TOTAL) {
    throw new Error(
      `World country dataset mismatch: expected ${WORLD_COUNTRY_TOTAL}, got ${codes.length}.`,
    );
  }
  if (new Set(codes).size !== codes.length) {
    throw new Error("World country dataset contains duplicate country codes.");
  }
  if (selectableWorldCountries.some((country) => !country.path.trim())) {
    throw new Error("World country dataset contains an empty SVG path.");
  }
}

validateWorldDataset();

const statusFill: Record<CountryVisualState, string> = {
  unvisited: "#455A6B",
  visited: statusMeta.visited.color,
  lived: statusMeta.lived.color,
  wishlist: statusMeta.wishlist.color,
};

export function WorldMap({
  visits,
  focus,
  selectedCountryCode,
  onCountryPress,
  height,
  interactive = true,
  borderRadius = 24,
  externalGesture,
  onInteractionChange,
}: {
  visits: TravelVisit[];
  focus: MapFocus;
  selectedCountryCode?: string | null;
  onCountryPress?: (country: WorldLocation) => void;
  height: number;
  interactive?: boolean;
  borderRadius?: number;
  externalGesture?: GestureType;
  onInteractionChange?: (active: boolean) => void;
}) {
  const reducedMotion = useReducedMotion();
  const zoom = useSharedValue(focus.zoom);
  const centerX = useSharedValue(focus.centerX);
  const centerY = useSharedValue(focus.centerY);
  const contentWidth = useSharedValue(1);
  const contentHeight = useSharedValue(1);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const pinchBaseZoom = useSharedValue(focus.zoom);
  const pinchWorldX = useSharedValue(focus.centerX);
  const pinchWorldY = useSharedValue(focus.centerY);
  const panBaseCenterX = useSharedValue(focus.centerX);
  const panBaseCenterY = useSharedValue(focus.centerY);
  const selectionPulse = useSharedValue(0);
  const activeGestureCount = useSharedValue(0);
  const panActive = useSharedValue(false);
  const pinchActive = useSharedValue(false);

  const visitByCode = useMemo(
    () => new Map(visits.map((visit) => [visit.country_code, visit])),
    [visits],
  );
  const countryBatches = useMemo(
    () => buildCountryPathBatches(selectableWorldCountries, visitByCode),
    [visitByCode],
  );

  if (__DEV__) {
    const renderedCodes = countryBatches.flatMap((batch) => batch.countryCodes);
    if (
      renderedCodes.length !== WORLD_COUNTRY_TOTAL ||
      new Set(renderedCodes).size !== WORLD_COUNTRY_TOTAL ||
      selectableWorldCountries.some(
        (country) => !renderedCodes.includes(country.id.toUpperCase()),
      )
    ) {
      throw new Error(
        "World map renderer does not cover the selectable dataset.",
      );
    }
  }
  const activeCountryCode = selectedCountryCode?.toUpperCase() ?? null;
  const selectedCountry = activeCountryCode
    ? countryByCode.get(activeCountryCode)
    : null;

  const handleMapTap = useCallback(
    (worldX: number, worldY: number, hitSlop: number) => {
      const country = findCountryAtPoint(worldX, worldY, hitSlop);
      if (country) onCountryPress?.(country);
    },
    [onCountryPress],
  );

  useEffect(() => {
    const next = clampedCenter(focus.centerX, focus.centerY, focus.zoom);
    zoom.value = withTiming(focus.zoom, { duration: 260 });
    centerX.value = withTiming(next.centerX, { duration: 260 });
    centerY.value = withTiming(next.centerY, { duration: 260 });
  }, [
    centerX,
    centerY,
    focus.centerX,
    focus.centerY,
    focus.id,
    focus.zoom,
    zoom,
  ]);

  useEffect(() => {
    selectionPulse.value = 0;
    // Preview maps and Reduce Motion should not keep an SVG animation running
    // while the map is only visible as context behind other UI.
    if (!activeCountryCode || !interactive || reducedMotion) return;
    selectionPulse.value = withRepeat(
      withTiming(1, {
        duration: 1650,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
    return () => cancelAnimation(selectionPulse);
  }, [activeCountryCode, interactive, reducedMotion, selectionPulse]);

  const updateViewport = (event: LayoutChangeEvent) => {
    const { width, height: viewportHeight } = event.nativeEvent.layout;
    if (!width || !viewportHeight) return;
    const sourceRatio = MAP_WIDTH / MAP_HEIGHT;
    const viewportRatio = width / viewportHeight;
    const nextContentWidth =
      viewportRatio > sourceRatio ? viewportHeight * sourceRatio : width;
    const nextContentHeight =
      viewportRatio > sourceRatio ? viewportHeight : width / sourceRatio;
    contentWidth.value = nextContentWidth;
    contentHeight.value = nextContentHeight;
    offsetX.value = (width - nextContentWidth) / 2;
    offsetY.value = (viewportHeight - nextContentHeight) / 2;
  };

  const gestures = useMemo(() => {
    const beginInteraction = () => {
      "worklet";
      if (activeGestureCount.value === 0 && onInteractionChange) {
        runOnJS(onInteractionChange)(true);
      }
      activeGestureCount.value += 1;
    };
    const endInteraction = () => {
      "worklet";
      activeGestureCount.value = Math.max(0, activeGestureCount.value - 1);
      if (activeGestureCount.value === 0 && onInteractionChange) {
        runOnJS(onInteractionChange)(false);
      }
    };
    const pinch = Gesture.Pinch()
      .enabled(interactive)
      .shouldCancelWhenOutside(false)
      .onStart((event) => {
        pinchActive.value = true;
        beginInteraction();
        cancelAnimation(zoom);
        cancelAnimation(centerX);
        cancelAnimation(centerY);
        pinchBaseZoom.value = zoom.value;
        pinchWorldX.value =
          centerX.value +
          ((event.focalX - offsetX.value) / contentWidth.value - 0.5) *
            (MAP_WIDTH / zoom.value);
        pinchWorldY.value =
          centerY.value +
          ((event.focalY - offsetY.value) / contentHeight.value - 0.5) *
            (MAP_HEIGHT / zoom.value);
      })
      .onUpdate((event) => {
        const nextZoom = clamp(
          pinchBaseZoom.value * event.scale,
          MIN_ZOOM,
          MAX_ZOOM,
        );
        const nextCenter = clampedCenter(
          pinchWorldX.value -
            ((event.focalX - offsetX.value) / contentWidth.value - 0.5) *
              (MAP_WIDTH / nextZoom),
          pinchWorldY.value -
            ((event.focalY - offsetY.value) / contentHeight.value - 0.5) *
              (MAP_HEIGHT / nextZoom),
          nextZoom,
        );
        zoom.value = nextZoom;
        centerX.value = nextCenter.centerX;
        centerY.value = nextCenter.centerY;
      })
      .onFinalize(() => {
        if (!pinchActive.value) return;
        pinchActive.value = false;
        endInteraction();
      });

    const pan = Gesture.Pan()
      .enabled(interactive)
      .maxPointers(1)
      .minDistance(4)
      .onStart(() => {
        panActive.value = true;
        beginInteraction();
        cancelAnimation(zoom);
        cancelAnimation(centerX);
        cancelAnimation(centerY);
        panBaseCenterX.value = centerX.value;
        panBaseCenterY.value = centerY.value;
      })
      .onUpdate((event) => {
        if (event.numberOfPointers !== 1) return;
        const proposedX =
          panBaseCenterX.value -
          (event.translationX / contentWidth.value) * (MAP_WIDTH / zoom.value);
        const proposedY =
          panBaseCenterY.value -
          (event.translationY / contentHeight.value) *
            (MAP_HEIGHT / zoom.value);
        centerX.value = rubberBandAxis(proposedX, MAP_WIDTH, zoom.value);
        centerY.value = rubberBandAxis(proposedY, MAP_HEIGHT, zoom.value);
      })
      .onFinalize((event) => {
        if (!panActive.value) return;
        panActive.value = false;
        const anotherGestureIsActive = activeGestureCount.value > 1;
        const nextCenter = clampedCenter(
          centerX.value,
          centerY.value,
          zoom.value,
        );
        if (!anotherGestureIsActive) {
          const visibleWidth = MAP_WIDTH / zoom.value;
          const visibleHeight = MAP_HEIGHT / zoom.value;
          const minX =
            visibleWidth >= MAP_WIDTH ? MAP_WIDTH / 2 : visibleWidth / 2;
          const maxX =
            visibleWidth >= MAP_WIDTH
              ? MAP_WIDTH / 2
              : MAP_WIDTH - visibleWidth / 2;
          const minY =
            visibleHeight >= MAP_HEIGHT ? MAP_HEIGHT / 2 : visibleHeight / 2;
          const maxY =
            visibleHeight >= MAP_HEIGHT
              ? MAP_HEIGHT / 2
              : MAP_HEIGHT - visibleHeight / 2;
          const outsideBounds =
            Math.abs(centerX.value - nextCenter.centerX) > 0.01 ||
            Math.abs(centerY.value - nextCenter.centerY) > 0.01;
          if (outsideBounds || minX === maxX) {
            centerX.value = withSpring(nextCenter.centerX, {
              damping: 20,
              stiffness: 220,
            });
          } else {
            centerX.value = withDecay({
              velocity:
                -(event.velocityX / contentWidth.value) *
                (MAP_WIDTH / zoom.value),
              clamp: [minX, maxX],
              deceleration: 0.995,
            });
          }
          if (outsideBounds || minY === maxY) {
            centerY.value = withSpring(nextCenter.centerY, {
              damping: 20,
              stiffness: 220,
            });
          } else {
            centerY.value = withDecay({
              velocity:
                -(event.velocityY / contentHeight.value) *
                (MAP_HEIGHT / zoom.value),
              clamp: [minY, maxY],
              deceleration: 0.995,
            });
          }
        }
        endInteraction();
      });

    // SVG paths no longer own the touch responder: on Fabric their press
    // handler won over pan/pinch. A short stationary tap is resolved here,
    // while any moved touch remains a map gesture.
    const tap = Gesture.Tap()
      .enabled(interactive)
      .maxDistance(10)
      .maxDuration(260)
      .onEnd((event, success) => {
        if (!success) return;
        const currentZoom = zoom.value;
        const worldX =
          centerX.value +
          ((event.x - offsetX.value) / contentWidth.value - 0.5) *
            (MAP_WIDTH / currentZoom);
        const worldY =
          centerY.value +
          ((event.y - offsetY.value) / contentHeight.value - 0.5) *
            (MAP_HEIGHT / currentZoom);
        runOnJS(handleMapTap)(worldX, worldY, 12 / currentZoom);
      });

    if (externalGesture) {
      pinch.blocksExternalGesture(externalGesture);
      pan.blocksExternalGesture(externalGesture);
    }
    return Gesture.Simultaneous(pinch, Gesture.Exclusive(pan, tap));
  }, [
    activeGestureCount,
    centerX,
    centerY,
    contentHeight,
    contentWidth,
    externalGesture,
    offsetX,
    offsetY,
    panBaseCenterX,
    panBaseCenterY,
    panActive,
    interactive,
    onInteractionChange,
    pinchBaseZoom,
    pinchActive,
    pinchWorldX,
    pinchWorldY,
    handleMapTap,
    zoom,
  ]);

  // `react-native-svg` applies animated group updates through its native
  // `matrix` prop. Updating the SVG transform string is ignored on the Fabric
  // renderer, which left every saved focus visually stuck on the world centre.
  // A direct affine matrix keeps the full camera on the UI thread and gives the
  // gesture calculations the same coordinate system as rendering.
  const animatedProps = useAnimatedProps(() => {
    const scale = zoom.value;
    return {
      matrix: [
        scale,
        0,
        0,
        scale,
        MAP_WIDTH / 2 - centerX.value * scale,
        MAP_HEIGHT / 2 - centerY.value * scale,
      ],
    };
  });
  const selectedPathProps = useAnimatedProps(() => ({
    fillOpacity:
      activeGestureCount.value > 0 ? 0.82 : 0.78 + selectionPulse.value * 0.22,
    strokeOpacity:
      activeGestureCount.value > 0 ? 0.9 : 0.78 + selectionPulse.value * 0.22,
    strokeWidth:
      activeGestureCount.value > 0 ? 1.6 : 1.35 + selectionPulse.value * 0.55,
  }));

  const content = (
    <View
      onLayout={updateViewport}
      style={[styles.viewport, { height, borderRadius }]}
    >
      <Svg
        accessibilityLabel={interactive ? "Interactive world map" : "World map"}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
      >
        <AnimatedMapGroup animatedProps={animatedProps as never}>
          <CountryGeometryLayer batches={countryBatches} />
          {selectedCountry ? (
            <AnimatedPath
              d={selectedCountry.path}
              fill="#2F9DE0"
              stroke="#DDF4FF"
              pointerEvents="none"
              vectorEffect="non-scaling-stroke"
              animatedProps={selectedPathProps}
            />
          ) : null}
        </AnimatedMapGroup>
      </Svg>
    </View>
  );

  return interactive ? (
    <GestureDetector gesture={gestures}>{content}</GestureDetector>
  ) : (
    content
  );
}

const styles = StyleSheet.create({
  viewport: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: "#06111A",
  },
});
