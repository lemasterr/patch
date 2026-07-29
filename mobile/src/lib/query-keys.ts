import type { QueryClient } from "@tanstack/react-query";

type CollectionInput = {
  ownerId: string;
  lifecycle?: "locked" | "in_progress" | "completed";
  category?: string;
  query?: string;
  sort?: string;
  includeHidden?: boolean;
  hiddenOnly?: boolean;
};

export const queryKeys = {
  profile: {
    self: () => ["profile", "self"] as const,
    public: (userId: string) => ["profile", "public", userId] as const,
  },
  collection: {
    list: (input: CollectionInput) => ["collection", "list", input] as const,
  },
  patch: {
    detail: (patchId: string) => ["patch", "detail", patchId] as const,
    events: (patchId: string) => ["patch", "events", patchId] as const,
  },
  discover: {
    deck: (roundId: number | string) => ["discover", "deck", roundId] as const,
    friends: (cursor?: string | null) =>
      ["discover", "friends", cursor ?? "first"] as const,
  },
  social: {
    friends: (userId: string) => ["social", "friends", userId] as const,
    requests: () => ["social", "requests"] as const,
    feed: (cursor?: string | null) =>
      ["social", "feed", cursor ?? "first"] as const,
    search: (query: string) => ["social", "search", query] as const,
  },
  notifications: {
    list: () => ["notifications", "list"] as const,
  },
  travel: {
    summary: (userId: string) => ["travel", "summary", userId] as const,
    visits: (userId: string) => ["travel", "visits", userId] as const,
  },
  settings: {
    self: () => ["settings", "self"] as const,
  },
} as const;

export const queryInvalidation = {
  like: ["patch", "collection", "profile", "discover", "social"],
  friend: ["social", "profile", "notifications"],
  travel: ["travel", "collection", "profile"],
  lifecycle: ["patch", "collection", "discover", "profile"],
  block: ["profile", "patch", "discover", "social", "notifications"],
} as const;

/** Invalidates every independent root, rather than treating roots as one key. */
export function invalidateQueryRoots(
  client: QueryClient,
  roots: readonly string[],
) {
  return Promise.all(
    roots.map((root) => client.invalidateQueries({ queryKey: [root] })),
  );
}
