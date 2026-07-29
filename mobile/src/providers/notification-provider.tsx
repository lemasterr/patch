import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { useQueryClient } from "@tanstack/react-query";
import { router, usePathname } from "expo-router";
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
import { AppState, Platform } from "react-native";

import { AchievementReadyBanner } from "@/components/achievement-ready-banner";
import { getNotifications } from "@/lib/queries";
import { routeForNotificationData } from "@/lib/notification-route";
import { supabase } from "@/lib/supabase";
import { setRegisteredPushToken } from "@/lib/push-token";
import { useAuth } from "@/providers/auth-provider";
import type { PatchNotification } from "@/types/domain";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

type NotificationContextValue = {
  notifications: PatchNotification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refreshPreferences: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

function projectId() {
  const fromExpoConfig = Constants.expoConfig?.extra?.eas;
  const value =
    fromExpoConfig && typeof fromExpoConfig === "object"
      ? (fromExpoConfig as { projectId?: unknown }).projectId
      : Constants.easConfig?.projectId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function prepareNotifications() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("patch", {
      name: "Patch updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 90, 180],
      lightColor: "#4A7DB7",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted && current.canAskAgain) {
    await Notifications.requestPermissionsAsync();
  }
}

async function registerPushToken() {
  if (!Device.isDevice) return;
  const id = projectId();
  if (!id) return;
  await prepareNotifications();
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
  const { error } = await supabase.rpc("register_push_device", {
    p_expo_push_token: token.data,
    p_platform: Platform.OS === "ios" ? "ios" : "android",
  });
  if (error) throw error;
  await setRegisteredPushToken(token.data);
}

export function NotificationProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [notifications, setNotifications] = useState<PatchNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [readyNotification, setReadyNotification] =
    useState<PatchNotification | null>(null);
  const [preferences, setPreferences] = useState({
    inApp: true,
    push: false,
  });
  const pathnameRef = useRef(pathname);
  const knownNotificationIds = useRef(new Set<string>());
  const notificationsHydrated = useRef(false);
  const shownAchievementIds = useRef(new Set<string>());
  const notificationOwnerId = useRef<string | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const nextOwnerId = session?.user.id ?? null;
    if (notificationOwnerId.current === nextOwnerId) return;
    // A notification list is account-scoped. Clear every derived cache before
    // a new subscription/fetch starts so activity can never flash from the
    // previous account after logout or account switching.
    notificationOwnerId.current = nextOwnerId;
    knownNotificationIds.current.clear();
    shownAchievementIds.current.clear();
    notificationsHydrated.current = false;
    setReadyNotification(null);
    setNotifications([]);
    setLoading(false);
    setPreferences({ inApp: true, push: false });
  }, [session?.user.id]);

  const showAchievementReady = useCallback((item: PatchNotification) => {
    if (
      item.type !== "achievement_completed" ||
      !item.achievement_id ||
      shownAchievementIds.current.has(item.achievement_id) ||
      pathnameRef.current === `/reveal/${item.achievement_id}`
    ) {
      return;
    }
    shownAchievementIds.current.add(item.achievement_id);
    setReadyNotification(item);
  }, []);

  const refreshPreferences = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from("user_settings")
      .select("in_app_notifications, push_notifications")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (data) {
      setPreferences({
        inApp: data.in_app_notifications,
        push: data.push_notifications,
      });
    }
  }, [session]);

  const refresh = useCallback(async () => {
    if (!session || !preferences.inApp) {
      setNotifications([]);
      return;
    }
    // Existing activity stays interactive while a foreground refresh checks
    // for new rows; the large spinner made opening the bell feel stalled.
    const shouldShowLoading = !notificationsHydrated.current;
    if (shouldShowLoading) setLoading(true);
    try {
      const next = await getNotifications(session.user.id);
      if (notificationsHydrated.current) {
        const newCompletion = next.find(
          (item) =>
            !knownNotificationIds.current.has(item.id) &&
            item.type === "achievement_completed" &&
            item.read_at === null,
        );
        if (newCompletion && preferences.inApp) {
          showAchievementReady(newCompletion);
        }
      }
      knownNotificationIds.current = new Set(next.map((item) => item.id));
      notificationsHydrated.current = true;
      setNotifications(next);
    } finally {
      if (shouldShowLoading) setLoading(false);
    }
  }, [preferences.inApp, session, showAchievementReady]);

  useEffect(() => {
    if (!session) return;
    const refreshTimer = setTimeout(() => {
      void refreshPreferences();
      void refresh();
    }, 0);

    const channel = supabase
      .channel(`mobile-notifications:${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `owner_id=eq.${session.user.id}`,
        },
        (payload) => {
          const item = payload.new as PatchNotification;
          knownNotificationIds.current.add(item.id);
          if (preferences.inApp) {
            setNotifications((current) => [
              item,
              ...current.filter((value) => value.id !== item.id),
            ]);
            showAchievementReady(item);
          }
          if (item.type === "achievement_completed") {
            void queryClient.invalidateQueries({
              queryKey: ["achievements", "owned", session.user.id],
            });
          }
        },
      )
      .subscribe();

    return () => {
      clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [
    preferences.inApp,
    queryClient,
    refresh,
    refreshPreferences,
    session,
    showAchievementReady,
  ]);

  useEffect(() => {
    if (!session || !preferences.push) return;
    void registerPushToken().catch(() => {
      // Denied permission, an offline token request, or absent EAS project
      // must never block in-app activity notifications.
    });
    const subscription = Notifications.addPushTokenListener((token) => {
      void supabase
        .rpc("register_push_device", {
          p_expo_push_token: token.data,
          p_platform: Platform.OS === "ios" ? "ios" : "android",
        })
        .then(({ error }) => {
          if (!error) return setRegisteredPushToken(token.data);
        });
    });
    return () => subscription.remove();
  }, [preferences.push, session]);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") void refresh();
      },
    );
    return () => appStateSubscription.remove();
  }, [refresh]);

  useEffect(() => {
    if (!readyNotification) return;
    const timer = setTimeout(() => setReadyNotification(null), 6_000);
    return () => clearTimeout(timer);
  }, [readyNotification]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const route = routeForNotificationData(
          response.notification.request.content.data,
        );
        if (route) router.push(route);
      },
    );
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const route = routeForNotificationData(
        response.notification.request.content.data,
      );
      if (route) router.push(route);
    });
    return () => subscription.remove();
  }, []);

  const unreadCount = notifications.filter((item) => !item.read_at).length;
  useEffect(() => {
    void Notifications.setBadgeCountAsync(unreadCount);
  }, [unreadCount]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      loading,
      refresh,
      markRead: async (id) => {
        if (!session) return;
        const now = new Date().toISOString();
        setNotifications((current) =>
          current.map((item) =>
            item.id === id ? { ...item, read_at: now } : item,
          ),
        );
        await supabase
          .from("notifications")
          .update({ read_at: now })
          .eq("id", id)
          .eq("owner_id", session.user.id);
      },
      markAllRead: async () => {
        if (!session) return;
        const now = new Date().toISOString();
        setNotifications((current) =>
          current.map((item) => ({ ...item, read_at: item.read_at ?? now })),
        );
        await supabase
          .from("notifications")
          .update({ read_at: now })
          .eq("owner_id", session.user.id)
          .is("read_at", null);
      },
      refreshPreferences,
    }),
    [loading, notifications, refresh, refreshPreferences, session, unreadCount],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {readyNotification ? (
        <AchievementReadyBanner
          notification={readyNotification}
          onDismiss={() => setReadyNotification(null)}
          onOpen={() => {
            const achievementId = readyNotification.achievement_id;
            const notificationId = readyNotification.id;
            const now = new Date().toISOString();
            setReadyNotification(null);
            setNotifications((current) =>
              current.map((item) =>
                item.id === notificationId ? { ...item, read_at: now } : item,
              ),
            );
            if (session) {
              void supabase
                .from("notifications")
                .update({ read_at: now })
                .eq("id", notificationId)
                .eq("owner_id", session.user.id);
            }
            if (achievementId) router.push(`/reveal/${achievementId}`);
          }}
        />
      ) : null}
    </NotificationContext.Provider>
  );
}

export function usePatchNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "usePatchNotifications must be used inside NotificationProvider.",
    );
  }
  return context;
}
