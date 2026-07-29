import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useEffect, useState, type PropsWithChildren } from "react";
import { AppState, Platform } from "react-native";

type NetworkState = {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
};

type ExpoNetworkModule = {
  getNetworkStateAsync: () => Promise<NetworkState>;
  addListener: (
    eventName: "onNetworkStateChanged",
    listener: (state: NetworkState) => void,
  ) => { remove: () => void };
};

const expoNetwork =
  requireOptionalNativeModule<ExpoNetworkModule>("ExpoNetwork");

function isOnline(state: NetworkState) {
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
    if (Platform.OS === "web") return;

    focusManager.setFocused(AppState.currentState === "active");
    const appState = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
    });

    if (expoNetwork) {
      void expoNetwork
        .getNetworkStateAsync()
        .then((state) => {
          onlineManager.setOnline(isOnline(state));
        })
        .catch(() => undefined);
    }
    const network = expoNetwork?.addListener(
      "onNetworkStateChanged",
      (state) => {
        onlineManager.setOnline(isOnline(state));
      },
    );

    return () => {
      appState.remove();
      network?.remove();
      focusManager.setFocused(undefined);
    };
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
