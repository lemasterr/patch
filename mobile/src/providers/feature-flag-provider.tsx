import { useQueryClient } from "@tanstack/react-query";
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

import {
  defaultFeatureFlags,
  loadFeatureFlagCache,
  resolveFeatureFlags,
  saveFeatureFlagCache,
  type FeatureFlagKey,
  type FeatureFlags,
  type FeatureFlagSource,
} from "@/lib/feature-flags";
import { queryKeys } from "@/lib/query-keys";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

type FeatureFlagContextValue = {
  flags: FeatureFlags;
  source: FeatureFlagSource;
  version: string;
  isEnabled: (key: FeatureFlagKey) => boolean;
  refresh: () => Promise<void>;
};

type FeatureFlagState = {
  ownerId: string | null;
  flags: FeatureFlags;
  source: FeatureFlagSource;
  version: string;
};

const defaultState = resolveFeatureFlags(null, null);
const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

export function FeatureFlagProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;
  const requestId = useRef(0);
  const activeUserId = useRef<string | null>(userId);
  const [state, setState] = useState<FeatureFlagState>({
    ownerId: null,
    ...defaultState,
  });

  useEffect(() => {
    activeUserId.current = userId;
  }, [userId]);

  const fetchRemote = useCallback(
    async (ownerId: string) => {
      const request = ++requestId.current;
      const { data, error } = await supabase.rpc(
        "get_runtime_feature_flags_v1",
      );
      if (
        error ||
        request !== requestId.current ||
        activeUserId.current !== ownerId
      ) {
        return;
      }
      const next = resolveFeatureFlags(data, null);
      setState({ ownerId, ...next });
      queryClient.setQueryData(queryKeys.featureFlags.all(ownerId), next.flags);
      await saveFeatureFlagCache(ownerId, next.flags).catch(() => undefined);
    },
    [queryClient],
  );

  const refresh = useCallback(async () => {
    if (userId) await fetchRemote(userId);
  }, [fetchRemote, userId]);

  useEffect(() => {
    const request = ++requestId.current;
    if (!userId) return;
    void loadFeatureFlagCache(userId)
      .then((cache) => {
        if (request !== requestId.current || activeUserId.current !== userId)
          return;
        const next = resolveFeatureFlags(null, cache);
        setState({ ownerId: userId, ...next });
        queryClient.setQueryData(
          queryKeys.featureFlags.all(userId),
          next.flags,
        );
      })
      .catch(() => undefined)
      .finally(() => {
        if (request === requestId.current && activeUserId.current === userId)
          void fetchRemote(userId);
      });
  }, [fetchRemote, queryClient, userId]);

  const value = useMemo<FeatureFlagContextValue>(
    () => ({
      flags: state.ownerId === userId ? state.flags : defaultFeatureFlags,
      source: state.ownerId === userId ? state.source : "default",
      version: state.ownerId === userId ? state.version : defaultState.version,
      isEnabled: (key) =>
        state.ownerId === userId ? state.flags[key] : defaultFeatureFlags[key],
      refresh,
    }),
    [refresh, state.flags, state.ownerId, state.source, state.version, userId],
  );

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagContext);
  if (!context)
    throw new Error("useFeatureFlags must be used inside FeatureFlagProvider.");
  return context;
}
