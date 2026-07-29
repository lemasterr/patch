import Storage from "expo-sqlite/kv-store";
import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query";

const CACHE_SCHEMA_VERSION = 1;

function cacheKey(userId: string) {
  return `patch:query-cache:v${CACHE_SCHEMA_VERSION}:${userId}`;
}

function isSafeQuery(queryKey: readonly unknown[]) {
  // Persist only an explicitly public, non-account-scoped feed. A deny-list
  // cannot protect new query keys and previously wrote profiles, collections,
  // friends and notifications to regular SQLite storage.
  return queryKey[0] === "discover";
}

export async function hydrateQueryCache(
  queryClient: QueryClient,
  userId: string,
) {
  const raw = await Storage.getItem(cacheKey(userId));
  if (!raw) return false;
  try {
    hydrate(queryClient, JSON.parse(raw));
    return true;
  } catch {
    await Storage.removeItem(cacheKey(userId));
    return false;
  }
}

export async function persistQueryCache(
  queryClient: QueryClient,
  userId: string,
) {
  const state = dehydrate(queryClient, {
    shouldDehydrateQuery: (query) =>
      query.state.status === "success" && isSafeQuery(query.queryKey),
  });
  await Storage.setItem(cacheKey(userId), JSON.stringify(state));
}

export async function clearPersistedQueryCache(userId: string) {
  await Storage.removeItem(cacheKey(userId));
}
