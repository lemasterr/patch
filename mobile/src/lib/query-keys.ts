import type { QueryClient } from "@tanstack/react-query";

type UserId = string;

type CollectionInput = {
  ownerId: UserId;
  lifecycle?: "locked" | "in_progress" | "completed";
  category?: string;
  query?: string;
  sort?: string;
  includeHidden?: boolean;
  hiddenOnly?: boolean;
};

// Every RLS-sensitive cache key includes the viewing account. A query made as
// account A must never be reused for account B during an auth transition.
export const queryKeys = {
  profile: {
    self: (userId: UserId) => ["profile", "self", userId] as const,
    public: (viewerId: UserId, profileId: string) =>
      ["profile", "public", viewerId, profileId] as const,
  },
  collection: {
    list: (input: CollectionInput) => ["collection", "list", input] as const,
    owned: (userId: UserId) => ["collection", "owned", userId] as const,
    counters: (userId: UserId) => ["collection", "counters", userId] as const,
  },
  patch: {
    detail: (viewerId: UserId, patchId: string) =>
      ["patch", "detail", viewerId, patchId] as const,
    events: (viewerId: UserId, patchId: string) =>
      ["patch", "events", viewerId, patchId] as const,
    liked: (viewerId: UserId, patchId: string) =>
      ["patch", "liked", viewerId, patchId] as const,
    publicByOwner: (viewerId: UserId, ownerId: string) =>
      ["patch", "public", viewerId, ownerId] as const,
  },
  discover: {
    deck: (
      userId: UserId,
      kind: "fresh" | "replay",
      roundId: number | string,
    ) => ["discover", "deck", userId, kind, roundId] as const,
    history: (userId: UserId) => ["discover", "history", userId] as const,
    friends: (userId: UserId, cursor?: string | null) =>
      ["discover", "friends", userId, cursor ?? "first"] as const,
  },
  social: {
    friends: (userId: UserId) => ["social", "friends", userId] as const,
    requests: (userId: UserId) => ["social", "requests", userId] as const,
    blocks: (userId: UserId) => ["social", "blocks", userId] as const,
    relationship: (userId: UserId, profileId: string) =>
      ["social", "relationship", userId, profileId] as const,
    feed: (userId: UserId) => ["social", "feed", userId] as const,
    search: (userId: UserId, query: string) =>
      ["social", "search", userId, query] as const,
  },
  notifications: {
    list: (userId: UserId) => ["notifications", "list", userId] as const,
    unread: (userId: UserId) => ["notifications", "unread", userId] as const,
  },
  travel: {
    summary: (userId: UserId) => ["travel", "summary", userId] as const,
    visits: (userId: UserId) => ["travel", "visits", userId] as const,
    journal: (userId: UserId) => ["travel", "journal", userId] as const,
    progress: (userId: UserId) => ["travel", "progress", userId] as const,
  },
  settings: {
    self: (userId: UserId) => ["settings", "self", userId] as const,
  },
  featureFlags: {
    all: (userId: UserId) => ["feature-flags", userId] as const,
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

export function invalidateForMutation(
  client: QueryClient,
  kind: keyof typeof queryInvalidation,
) {
  return invalidateQueryRoots(client, queryInvalidation[kind]);
}
