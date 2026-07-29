import { onlineManager, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";

import {
  clearPersistedQueryCache,
  hydrateQueryCache,
  persistQueryCache,
} from "@/lib/offline/cache-persister";
import {
  clearOfflineUserData,
  claimNextOperation,
  completeOperation,
  discardOperation,
  enqueueOperation,
  failOperation,
  listOperations,
  reclaimStalledOperations,
  retryOperation,
  type OfflineOperation,
} from "@/lib/offline/database";
import { executeOfflineOperation } from "@/lib/offline/operation-handlers";
import { toAppError } from "@/lib/result";
import { useAuth } from "@/providers/auth-provider";

type QueueInput = {
  id: string;
  operationType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
};

type OfflineContextValue = {
  hydrated: boolean;
  isOnline: boolean;
  pendingCount: number;
  enqueue: (operation: QueueInput) => Promise<void>;
  refreshQueue: () => Promise<void>;
  retry: (operationId: string) => Promise<void>;
  discard: (operationId: string) => Promise<void>;
  operations: OfflineOperation[];
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;
  const [hydrated, setHydrated] = useState(false);
  const [isOnline, setIsOnline] = useState(onlineManager.isOnline());
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const processing = useRef(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousUser = useRef<string | null>(null);

  const loadOperations = useCallback(async (nextUserId: string) => {
    setOperations(await listOperations(nextUserId));
  }, []);

  const processQueue = useCallback(async () => {
    if (!userId || !onlineManager.isOnline() || processing.current) return;
    processing.current = true;
    try {
      for (;;) {
        const operation = await claimNextOperation(userId);
        if (!operation) break;
        try {
          await executeOfflineOperation(operation);
          await completeOperation(operation.id);
        } catch (error) {
          const appError = toAppError(error);
          await failOperation(
            operation.id,
            operation.attempt,
            appError.code,
            appError.retryable,
          );
          if (!appError.retryable) continue;
          break;
        }
      }
    } finally {
      processing.current = false;
      await loadOperations(userId);
    }
  }, [loadOperations, userId]);

  useEffect(() => {
    const unsubscribe = onlineManager.subscribe((online) => {
      setIsOnline(online);
      if (online) void processQueue();
    });
    return unsubscribe;
  }, [processQueue]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void processQueue();
    });
    return () => subscription.remove();
  }, [processQueue]);

  useEffect(() => {
    let active = true;
    async function hydrateUser() {
      const oldUser = previousUser.current;
      previousUser.current = userId;
      setHydrated(false);
      if (oldUser && oldUser !== userId) {
        await Promise.all([
          clearPersistedQueryCache(oldUser),
          clearOfflineUserData(oldUser),
        ]);
        queryClient.clear();
      }
      if (!userId) {
        if (!active) return;
        setOperations([]);
        setHydrated(true);
        return;
      }
      await reclaimStalledOperations(userId, 0);
      await Promise.all([
        hydrateQueryCache(queryClient, userId),
        loadOperations(userId),
      ]);
      if (!active) return;
      setHydrated(true);
      void processQueue();
    }
    void hydrateUser();
    return () => {
      active = false;
    };
  }, [loadOperations, processQueue, queryClient, userId]);

  useEffect(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (!userId || !hydrated || !isOnline) return;
    const nextRetry = operations
      .filter((operation) => operation.state === "failed")
      .map((operation) => new Date(operation.nextAttemptAt).getTime())
      .filter(Number.isFinite)
      .sort((left, right) => left - right)[0];
    if (nextRetry === undefined) return;
    retryTimer.current = setTimeout(
      () => void processQueue(),
      Math.max(0, nextRetry - Date.now()),
    );
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [hydrated, isOnline, operations, processQueue, userId]);

  useEffect(() => {
    if (!userId || !hydrated) return;
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        void persistQueryCache(queryClient, userId);
      }, 750);
    });
    return () => {
      unsubscribe();
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [hydrated, queryClient, userId]);

  const value = useMemo<OfflineContextValue>(
    () => ({
      hydrated,
      isOnline,
      pendingCount: operations.filter((operation) => operation.state !== "dead")
        .length,
      operations,
      enqueue: async (input) => {
        if (!userId) throw new Error("Sign in before queuing an operation.");
        await enqueueOperation({ ...input, userId });
        await loadOperations(userId);
        void processQueue();
      },
      refreshQueue: processQueue,
      retry: async (operationId) => {
        await retryOperation(operationId);
        if (userId) await loadOperations(userId);
        void processQueue();
      },
      discard: async (operationId) => {
        await discardOperation(operationId);
        if (userId) await loadOperations(userId);
      },
    }),
    [hydrated, isOnline, loadOperations, operations, processQueue, userId],
  );

  return (
    <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context)
    throw new Error("useOffline must be used inside OfflineProvider.");
  return context;
}
