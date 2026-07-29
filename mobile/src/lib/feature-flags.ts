import Storage from "expo-sqlite/kv-store";

export const featureFlagKeys = [
  "patch_creation_enabled",
  "discover_enabled",
  "social_enabled",
  "travel_enabled",
  "push_enabled",
  "discover_recommendation_rounds",
  "collection_cursor_pagination",
  "content_moderation_pipeline",
] as const;

export type FeatureFlagKey = (typeof featureFlagKeys)[number];
export type FeatureFlags = Record<FeatureFlagKey, boolean>;
export type FeatureFlagSource = "default" | "cache" | "stale-cache" | "remote";

export type FeatureFlagRow = { key: string; enabled: boolean };

export type FeatureFlagCache = {
  version: number;
  savedAt: number;
  flags: FeatureFlags;
};

export type ResolvedFeatureFlags = {
  flags: FeatureFlags;
  source: FeatureFlagSource;
  version: string;
};

const CACHE_VERSION = 1;
const STALE_AFTER_MS = 5 * 60 * 1_000;
const EXPIRES_AFTER_MS = 7 * 24 * 60 * 60 * 1_000;

// Existing released experiences stay available if a device has never reached
// the flags RPC. Emergency disables are cached as soon as they are received;
// flags are product controls, never an authorization boundary.
export const defaultFeatureFlags: FeatureFlags = {
  patch_creation_enabled: true,
  discover_enabled: true,
  social_enabled: true,
  travel_enabled: true,
  push_enabled: true,
  discover_recommendation_rounds: true,
  collection_cursor_pagination: true,
  content_moderation_pipeline: false,
};

function cacheKey(userId: string) {
  return `patch:feature-flags:v${CACHE_VERSION}:${userId}`;
}

function isFeatureFlagKey(value: string): value is FeatureFlagKey {
  return (featureFlagKeys as readonly string[]).includes(value);
}

function isFeatureFlags(value: unknown): value is FeatureFlags {
  if (!value || typeof value !== "object") return false;
  return featureFlagKeys.every(
    (key) => typeof (value as Record<string, unknown>)[key] === "boolean",
  );
}

function isFeatureFlagCache(value: unknown): value is FeatureFlagCache {
  if (!value || typeof value !== "object") return false;
  const cache = value as Partial<FeatureFlagCache>;
  return (
    cache.version === CACHE_VERSION &&
    typeof cache.savedAt === "number" &&
    Number.isFinite(cache.savedAt) &&
    isFeatureFlags(cache.flags)
  );
}

export function normalizeFeatureFlags(rows: readonly FeatureFlagRow[]) {
  const flags = { ...defaultFeatureFlags };
  for (const row of rows) {
    if (isFeatureFlagKey(row.key) && typeof row.enabled === "boolean") {
      flags[row.key] = row.enabled;
    }
  }
  return flags;
}

export function featureFlagVersion(flags: FeatureFlags) {
  return `v${CACHE_VERSION}:${featureFlagKeys
    .map((key) => `${key}=${flags[key] ? 1 : 0}`)
    .join(",")}`;
}

export function resolveFeatureFlags(
  remote: readonly FeatureFlagRow[] | null,
  cache: FeatureFlagCache | null,
  now = Date.now(),
): ResolvedFeatureFlags {
  if (remote) {
    const flags = normalizeFeatureFlags(remote);
    return { flags, source: "remote", version: featureFlagVersion(flags) };
  }
  if (cache) {
    const age = Math.max(0, now - cache.savedAt);
    if (age <= EXPIRES_AFTER_MS) {
      return {
        flags: cache.flags,
        source: age <= STALE_AFTER_MS ? "cache" : "stale-cache",
        version: featureFlagVersion(cache.flags),
      };
    }
  }
  return {
    flags: { ...defaultFeatureFlags },
    source: "default",
    version: featureFlagVersion(defaultFeatureFlags),
  };
}

export async function loadFeatureFlagCache(userId: string) {
  const raw = await Storage.getItem(cacheKey(userId));
  if (!raw) return null;
  try {
    const cache = JSON.parse(raw) as unknown;
    if (isFeatureFlagCache(cache)) return cache;
  } catch {
    // Invalid cache is discarded below.
  }
  await Storage.removeItem(cacheKey(userId));
  return null;
}

export async function saveFeatureFlagCache(
  userId: string,
  flags: FeatureFlags,
) {
  const cache: FeatureFlagCache = {
    version: CACHE_VERSION,
    savedAt: Date.now(),
    flags,
  };
  await Storage.setItem(cacheKey(userId), JSON.stringify(cache));
}

export async function clearFeatureFlagCache(userId: string) {
  await Storage.removeItem(cacheKey(userId));
}
