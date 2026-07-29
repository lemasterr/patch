export type SerializedMutationQueue = {
  enqueue: (key: string, mutation: () => Promise<void>) => Promise<void>;
};

/** Keeps writes for one logical server field in request order. */
export function createSerializedMutationQueue(): SerializedMutationQueue {
  const pending = new Map<string, Promise<void>>();

  return {
    enqueue(key, mutation) {
      const previous = pending.get(key) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(mutation);
      pending.set(key, next);
      void next
        .finally(() => {
          if (pending.get(key) === next) pending.delete(key);
        })
        .catch(() => undefined);
      return next;
    },
  };
}
