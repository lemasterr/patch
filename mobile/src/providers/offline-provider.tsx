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
import { clearCreateDraft } from "@/lib/offline/create-draft";
import {
  clearOfflineUserData,
  claimNextOperation,
  completeOperation,
  consumeOperationResult,
  countOperations,
  discardOperation,
  enqueueOperation,
  failOperation,
  listOperations,
  listOperationResults,
  reclaimStalledOperations,
  releaseOperation,
  retryOperation,
  type OfflineOperation,
  type OfflineOperationCounts,
  type OfflineOperationResult,
  type QueuedOperationType,
} from "@/lib/offline/database";
import { executeOfflineOperation } from "@/lib/offline/operation-handlers";
import { toAppError } from "@/lib/result";
import { useAuth } from "@/providers/auth-provider";

type QueueInput = {
  id: string;
  operationType: QueuedOperationType;
  payload: Record<string, unknown>;
  idempotencyKey: string;
};

type OfflineContextValue = {
  hydrated: boolean;
  isOnline: boolean;
  pendingCount: number;
  operationCounts: OfflineOperationCounts;
  enqueue: (operation: QueueInput) => Promise<void>;
  refreshQueue: () => Promise<void>;
  retry: (operationId: string) => Promise<void>;
  discard: (operationId: string) => Promise<void>;
  operations: OfflineOperation[];
  completedResults: OfflineOperationResult[];
  consumeCompletedResult: (
    operationId: string,
  ) => Promise<OfflineOperationResult | null>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;
  const [hydrated, setHydrated] = useState(false);
  const [isOnline, setIsOnline] = useState(onlineManager.isOnline());
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [completedResults, setCompletedResults] = useState<
    OfflineOperationResult[]
  >([]);
  const [queueDataOwnerId, setQueueDataOwnerId] = useState<string | null>(null);
  const processing = useRef(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousUser = useRef<string | null>(null);
  const activeUserId = useRef<string | null>(userId);

  useEffect(() => {
    activeUserId.current = userId;
  }, [userId]);

  const loadOperations = useCallback(async (nextUserId: string) => {
    setOperations(await listOperations(nextUserId));
  }, []);

  const loadCompletedResults = useCallback(async (nextUserId: string) => {
    setCompletedResults(await listOperationResults(nextUserId));
  }, []);

  const processQueue = useCallback(async () => {
    if (
      !userId ||
      activeUserId.current !== userId ||
      !onlineManager.isOnline() ||
      processing.current
    )
      return;
    processing.current = true;
    try {
      for (;;) {
        const operation = await claimNextOperation(userId);
        if (!operation) break;
        if (activeUserId.current !== userId) {
          await releaseOperation(operation.id);
          break;
        }
        try {
          const result = await executeOfflineOperation(operation);
          if (activeUserId.current !== userId) {
            await releaseOperation(operation.id);
            break;
          }
          await completeOperation(operation, result);
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
      if (activeUserId.current === userId)
        await Promise.all([
          loadOperations(userId),
          loadCompletedResults(userId),
        ]);
    }
  }, [loadCompletedResults, loadOperations, userId]);

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
      setQueueDataOwnerId(null);
      if (oldUser && oldUser !== userId) {
        await Promise.all([
          clearPersistedQueryCache(oldUser),
          clearOfflineUserData(oldUser),
          clearCreateDraft(oldUser),
        ]);
        queryClient.clear();
      }
      if (!userId) {
        if (!active) return;
        setOperations([]);
        setCompletedResults([]);
        setQueueDataOwnerId(null);
        setHydrated(true);
        return;
      }
      await reclaimStalledOperations(userId);
      await Promise.all([
        hydrateQueryCache(queryClient, userId),
        loadOperations(userId),
        loadCompletedResults(userId),
      ]);
      if (!active) return;
      setQueueDataOwnerId(userId);
      setHydrated(true);
      void processQueue();
    }
    void hydrateUser();
    return () => {
      active = false;
    };
  }, [loadCompletedResults, loadOperations, processQueue, queryClient, userId]);

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

  const value = useMemo<OfflineContextValue>(() => {
    // Effects clear storage after an account transition. Do not expose the
    // previous account's in-memory queue or completed results during that
    // short interval.
    const hasCurrentUserData = queueDataOwnerId === userId;
    const visibleOperations = hasCurrentUserData ? operations : [];
    const visibleCompletedResults = hasCurrentUserData ? completedResults : [];
    const operationCounts = countOperations(visibleOperations);
    return {
      hydrated: hydrated && hasCurrentUserData,
      isOnline,
      pendingCount:
        operationCounts.pending +
        operationCounts.running +
        operationCounts.failed,
      operationCounts,
      operations: visibleOperations,
      completedResults: visibleCompletedResults,
      consumeCompletedResult: async (operationId) => {
        if (!userId) return null;
        const result = await consumeOperationResult(userId, operationId);
        if (result) {
          setCompletedResults((current) =>
            current.filter((item) => item.operationId !== operationId),
          );
        }
        return result;
      },
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
    };
  }, [
    completedResults,
    hydrated,
    isOnline,
    loadOperations,
    operations,
    processQueue,
    queueDataOwnerId,
    userId,
  ]);

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
