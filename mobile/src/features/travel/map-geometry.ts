import { worldRegions } from "@/data/world-regions";
import {
  countryBounds,
  type MapBounds,
} from "@/features/travel/generated-country-bounds";
import type { MapFocus, MapFocusId } from "@/features/travel/types";

export const MAP_WIDTH = 1010;
export const MAP_HEIGHT = 666;
export const WORLD_BOUNDS: MapBounds = [0, 0, MAP_WIDTH, MAP_HEIGHT];

const REGION_FOCUS_EXCLUSIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  // Russia spans far into Asia and makes a Europe camera almost identical to
  // World. The travel category still contains Russia; only this visual focus
  // excludes the transcontinental outlier.
  europe: new Set(["RU"]),
  // Remote territories make a Pacific overview too wide to be useful.
  oceania: new Set(["TF", "UM"]),
};

// Camera framing is a product decision, not a raw union of every territory.
// The generated bounds include remote islands and polar territories; those are
// valid selectable countries but create misleading continent cameras (Europe
// appeared to centre on Africa). These frames favour the actual landmass a
// person expects to see after choosing a continent.
const REGION_CAMERA_BOUNDS: Partial<Record<MapFocusId, MapBounds>> = {
  europe: [423, 175, 586, 370],
  asia: [590, 280, 875, 465],
  africa: [420, 355, 640, 555],
  americas: [120, 270, 385, 590],
  oceania: [755, 430, 1009, 646],
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function unionBounds(bounds: readonly MapBounds[]): MapBounds {
  if (!bounds.length) return WORLD_BOUNDS;
  return bounds.reduce<MapBounds>(
    ([minX, minY, maxX, maxY], [nextMinX, nextMinY, nextMaxX, nextMaxY]) => [
      Math.min(minX, nextMinX),
      Math.min(minY, nextMinY),
      Math.max(maxX, nextMaxX),
      Math.max(maxY, nextMaxY),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

export function fitBounds(
  bounds: MapBounds,
  {
    id,
    label,
    padding = 28,
    minimumSize = 0,
    minZoom = 0.88,
    maxZoom = 9,
  }: {
    id: string;
    label: string;
    padding?: number;
    minimumSize?: number;
    minZoom?: number;
    maxZoom?: number;
  },
): MapFocus {
  const [minX, minY, maxX, maxY] = bounds;
  const width = Math.max(maxX - minX, minimumSize);
  const height = Math.max(maxY - minY, minimumSize);
  const availableWidth = Math.max(1, MAP_WIDTH - padding * 2);
  const availableHeight = Math.max(1, MAP_HEIGHT - padding * 2);
  const zoom = clamp(
    Math.min(availableWidth / width, availableHeight / height),
    minZoom,
    maxZoom,
  );
  return {
    id,
    label,
    zoom,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

export function getCountryBounds(countryCode?: string | null) {
  return countryCode
    ? (countryBounds[countryCode.toUpperCase()] ?? null)
    : null;
}

export function focusByCountryCode(countryCode: string, label?: string) {
  const code = countryCode.toUpperCase();
  const bounds = getCountryBounds(code);
  if (!bounds) return focusById("world");
  return fitBounds(bounds, {
    id: `country-${code}`,
    label: label ?? code,
    padding: 58,
    // Tiny states and islands otherwise jump to a disorienting 20× zoom.
    // This keeps the selected country prominent while preserving its region.
    minimumSize: 96,
    minZoom: 1.4,
    maxZoom: 8,
  });
}

export const regionBounds = Object.fromEntries(
  worldRegions.map((region) => {
    if (region.id === "world") return [region.id, WORLD_BOUNDS] as const;
    const excluded = REGION_FOCUS_EXCLUSIONS[region.id] ?? new Set<string>();
    const bounds = [...(region.codes ?? [])]
      .filter((code) => !excluded.has(code))
      .flatMap((code) => {
        const country = countryBounds[code];
        return country ? [country] : [];
      });
    return [region.id, unionBounds(bounds)] as const;
  }),
) as Readonly<Record<MapFocusId, MapBounds>>;

type SavedMapFocus = MapFocus & { id: MapFocusId };

export const mapFocuses: readonly SavedMapFocus[] = worldRegions.map(
  (region) => {
    const bounds = REGION_CAMERA_BOUNDS[region.id] ?? regionBounds[region.id];
    return fitBounds(bounds, {
      id: region.id,
      label: region.label,
      padding: region.id === "world" ? 40 : 50,
      minZoom: 0.88,
      maxZoom: region.id === "world" ? 0.88 : 5,
    }) as SavedMapFocus;
  },
);

export function focusById(id?: string | null) {
  return mapFocuses.find((focus) => focus.id === id) ?? mapFocuses[0];
}
