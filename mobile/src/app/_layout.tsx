import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Asset } from "expo-asset";
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as RouterThemeProvider,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import mascotGreeting from "@/assets/images/patch-mascot-greeting.webp";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { FeatureFlagProvider } from "@/providers/feature-flag-provider";
import { NotificationProvider } from "@/providers/notification-provider";
import { OfflineProvider } from "@/providers/offline-provider";
import { QueryProvider } from "@/providers/query-provider";
import { PatchThemeProvider, useTheme } from "@/providers/theme-provider";

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 220, fade: true });

function Navigation() {
  const { loading: authLoading } = useAuth();
  const { colors, resolved } = useTheme();
  const [greetingReady, setGreetingReady] = useState(false);
  const [navigationLaidOut, setNavigationLaidOut] = useState(false);

  useEffect(() => {
    let mounted = true;
    void Asset.fromModule(mascotGreeting as number)
      .downloadAsync()
      .finally(() => {
        if (mounted) setGreetingReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (authLoading || !greetingReady || !navigationLaidOut) return;
    void SplashScreen.hideAsync();
  }, [authLoading, greetingReady, navigationLaidOut]);

  const routerTheme = {
    ...(resolved === "dark" ? DarkTheme : DefaultTheme),
    colors: {
      ...(resolved === "dark" ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.surface,
      primary: colors.blue,
      text: colors.ink,
      border: colors.border,
      notification: colors.red,
    },
  };

  return (
    <RouterThemeProvider value={routerTheme}>
      <View style={{ flex: 1 }} onLayout={() => setNavigationLaidOut(true)}>
        <NotificationProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "fade_from_bottom",
              orientation: "portrait",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="auth" options={{ animation: "fade" }} />
            <Stack.Screen
              name="auth/callback"
              options={{ animation: "fade" }}
            />
            <Stack.Screen
              name="forgot-password"
              options={{ presentation: "card" }}
            />
            <Stack.Screen
              name="reset-password"
              options={{ presentation: "card" }}
            />
            <Stack.Screen
              name="delete-account"
              options={{ presentation: "card" }}
            />
            <Stack.Screen
              name="onboarding"
              options={{ animation: "slide_from_right" }}
            />
            <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
            <Stack.Screen
              name="map-fullscreen"
              options={{
                presentation: "fullScreenModal",
                animation: "fade",
                orientation: "all",
              }}
            />
            <Stack.Screen name="friends" options={{ presentation: "card" }} />
            <Stack.Screen
              name="friends-feed"
              options={{ presentation: "card" }}
            />
            <Stack.Screen
              name="people-search"
              options={{ presentation: "card" }}
            />
            <Stack.Screen
              name="blocked-users"
              options={{ presentation: "card" }}
            />
            <Stack.Screen
              name="notifications"
              options={{ presentation: "card" }}
            />
            <Stack.Screen name="settings" options={{ presentation: "card" }} />
            <Stack.Screen
              name="viewing-history"
              options={{ presentation: "card" }}
            />
            <Stack.Screen
              name="settings/[section]"
              options={{ presentation: "card" }}
            />
            <Stack.Screen
              name="account-security"
              options={{ presentation: "card" }}
            />
            <Stack.Screen name="user/[id]" options={{ presentation: "card" }} />
            <Stack.Screen
              name="achievement/[id]"
              options={{ presentation: "card" }}
            />
            <Stack.Screen
              name="achievement-edit/[id]"
              options={{ presentation: "modal" }}
            />
            <Stack.Screen
              name="profile-edit"
              options={{ presentation: "modal" }}
            />
            <Stack.Screen
              name="reveal/[id]"
              options={{ presentation: "fullScreenModal", animation: "fade" }}
            />
          </Stack>
        </NotificationProvider>
      </View>
    </RouterThemeProvider>
  );
}

function ThemedApplication() {
  const { resolved } = useTheme();

  // Legacy StyleSheets reference Android PlatformColor resources. Remounting
  // this visual subtree after a preference change makes every native view bind
  // the newly selected resource variant, including screens not yet mounted.
  return (
    <FeatureFlagProvider>
      <OfflineProvider key={resolved}>
        <Navigation />
      </OfflineProvider>
    </FeatureFlagProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <AuthProvider>
            <PatchThemeProvider>
              <ThemedApplication />
            </PatchThemeProvider>
          </AuthProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
