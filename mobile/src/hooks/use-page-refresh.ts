import { useCallback, useState } from "react";

export type RefreshProgress =
  "idle" | "loading" | "success" | "partial" | "error";

type RefreshTarget = () => Promise<unknown>;

type UsePageRefreshOptions = {
  targets: readonly RefreshTarget[];
  replay?: () => Promise<unknown>;
  canRefresh?: () => boolean;
  minimumVisibleMs?: number;
};

export function usePageRefresh({
  targets,
  replay,
  canRefresh,
  minimumVisibleMs = 400,
}: UsePageRefreshOptions) {
  const [isRefreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] =
    useState<RefreshProgress>("idle");

  const onRefresh = useCallback(async () => {
    if (isRefreshing || canRefresh?.() === false) return;
    const startedAt = Date.now();
    setRefreshing(true);
    setRefreshProgress("loading");
    const results = await Promise.allSettled([
      ...targets.map((target) => target()),
      ...(replay ? [replay()] : []),
    ]);
    const elapsed = Date.now() - startedAt;
    if (elapsed < minimumVisibleMs) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, minimumVisibleMs - elapsed),
      );
    }
    const failures = results.filter(
      (result) => result.status === "rejected",
    ).length;
    setRefreshProgress(
      failures === 0
        ? "success"
        : failures === results.length
          ? "error"
          : "partial",
    );
    setRefreshing(false);
  }, [canRefresh, isRefreshing, minimumVisibleMs, replay, targets]);

  return {
    isRefreshing,
    refreshProgress,
    onRefresh,
    accessibilityLabel: isRefreshing
      ? "Refreshing"
      : refreshProgress === "error"
        ? "Couldn’t refresh"
        : "Refresh page",
  };
}
