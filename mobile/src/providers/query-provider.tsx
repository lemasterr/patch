import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import * as Network from "expo-network";
import { useEffect, useState, type PropsWithChildren } from "react";
import { AppState } from "react-native";

function isOnline(state: Network.NetworkState) {
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

export function QueryProvider({ children }: PropsWithChildren) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: 2,
            retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },
          mutations: { retry: false },
        },
      }),
  );

  useEffect(() => {
    let active = true;

    focusManager.setFocused(AppState.currentState === "active");
    const appState = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
    });

    void Network.getNetworkStateAsync()
      .then((state) => {
        if (active) onlineManager.setOnline(isOnline(state));
      })
      .catch(() => undefined);
    const network = Network.addNetworkStateListener((state) => {
      onlineManager.setOnline(isOnline(state));
    });

    return () => {
      active = false;
      appState.remove();
      network.remove();
      focusManager.setFocused(undefined);
    };
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
