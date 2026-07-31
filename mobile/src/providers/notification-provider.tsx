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
import { invalidateForMutation } from "@/lib/query-keys";
import { routeForNotificationData } from "@/lib/notification-route";
import { supabase } from "@/lib/supabase";
import {
  clearPendingPushDisable,
  clearPushTokenRefreshPending,
  getPushInstallationId,
  markPushTokenRefreshPending,
  setRegisteredPushDevice,
} from "@/lib/push-token";
import { useAuth } from "@/providers/auth-provider";
import { useFeatureFlags } from "@/providers/feature-flag-provider";
import type { PatchNotification } from "@/types/domain";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// This value is compiled into `extra` by app.config.ts. The local Personal
// Team build intentionally excludes APNs, while normal and EAS builds retain
// remote push unless PATCH_ENABLE_PUSH_NOTIFICATIONS=0 was set for prebuild.
const remotePushEnabled =
  Constants.expoConfig?.extra?.remotePushEnabled !== false;

type NotificationContextValue = {
  notifications: PatchNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markingAllRead: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  isMarkingRead: (id: string) => boolean;
  refreshPreferences: () => Promise<void>;
  pushRegistration: PushRegistration;
};

type NotificationState = {
  ownerId: string | null;
  items: PatchNotification[];
};

type ReadyNotificationState = {
  ownerId: string;
  item: PatchNotification;
};

type PushRegistrationStatus =
  | "disabled"
  | "feature_paused"
  | "permission_denied"
  | "registering"
  | "registered"
  | "unavailable"
  | "failed";

type PushRegistration = {
  ownerId: string | null;
  status: PushRegistrationStatus;
  message: string;
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

async function registerPushToken(
  ownerId: string,
  devicePushToken?: Notifications.DevicePushToken,
  isOwnerCurrent: () => boolean = () => true,
): Promise<Omit<PushRegistration, "ownerId">> {
  if (!Device.isDevice) {
    return {
      status: "unavailable",
      message: "Push notifications require a physical device.",
    };
  }
  const id = projectId();
  if (!id) {
    return {
      status: "unavailable",
      message: "This build is missing its push project configuration.",
    };
  }
  await prepareNotifications();
  if (!isOwnerCurrent()) throw new Error("Push registration owner changed.");
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    return {
      status: "permission_denied",
      message: "Notification permission is off in your device settings.",
    };
  }
  const token = await Notifications.getExpoPushTokenAsync({
    projectId: id,
    ...(devicePushToken ? { devicePushToken } : {}),
  });
  const installationId = await getPushInstallationId();
  if (!isOwnerCurrent()) throw new Error("Push registration owner changed.");
  const { error } = await supabase.rpc("register_push_device", {
    p_expo_push_token: token.data,
    p_platform: Platform.OS === "ios" ? "ios" : "android",
    p_installation_id: installationId,
  });
  if (error) throw error;
  // The RPC updates one installation in a single transaction. That retires
  // pending deliveries for account A before account B can reuse this device.
  await Promise.all([
    setRegisteredPushDevice({
      ownerId,
      installationId,
      expoPushToken: token.data,
    }),
    clearPendingPushDisable(),
    clearPushTokenRefreshPending(),
  ]);
  return { status: "registered", message: "This device is registered." };
}

export function NotificationProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const { isEnabled } = useFeatureFlags();
  const userId = session?.user.id ?? null;
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [notificationState, setNotificationState] = useState<NotificationState>(
    { ownerId: null, items: [] },
  );
  const [loadingState, setLoadingState] = useState({
    ownerId: null as string | null,
    value: false,
  });
  const [readyNotificationState, setReadyNotificationState] =
    useState<ReadyNotificationState | null>(null);
  const [preferences, setPreferences] = useState({
    inApp: true,
    push: false,
  });
  const [pushRegistrationState, setPushRegistrationState] =
    useState<PushRegistration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingReadState, setPendingReadState] = useState({
    ownerId: null as string | null,
    ids: [] as string[],
  });
  const [markingAllReadState, setMarkingAllReadState] = useState({
    ownerId: null as string | null,
    value: false,
  });
  const pathnameRef = useRef(pathname);
  const knownNotificationIds = useRef(new Set<string>());
  const notificationsHydrated = useRef(false);
  const shownAchievementIds = useRef(new Set<string>());
  const notificationOwnerId = useRef<string | null>(null);
  const notificationRequest = useRef(0);
  const pendingReadIds = useRef(new Set<string>());
  const markingAllReadOwner = useRef<string | null>(null);
  const activeAuthOwnerRef = useRef(userId);

  // State is tagged with its owner and is hidden before effects run. This
  // prevents a one-render flash of account A's activity when account B signs
  // in, even if an A request resolves late.
  const notifications = useMemo(
    () => (notificationState.ownerId === userId ? notificationState.items : []),
    [notificationState, userId],
  );
  const loading = loadingState.ownerId === userId ? loadingState.value : false;
  const readyNotification =
    readyNotificationState?.ownerId === userId
      ? readyNotificationState.item
      : null;
  const markingAllRead =
    markingAllReadState.ownerId === userId && markingAllReadState.value;
  const pushRegistration = useMemo<PushRegistration>(() => {
    if (!userId || !preferences.push) {
      return {
        ownerId: userId,
        status: "disabled",
        message: "Remote push is turned off in Patch.",
      };
    }
    if (!remotePushEnabled) {
      return {
        ownerId: userId,
        status: "unavailable",
        message: "Remote push is not included in this development build.",
      };
    }
    if (!isEnabled("push_enabled")) {
      return {
        ownerId: userId,
        status: "feature_paused",
        message: "Remote push is temporarily paused.",
      };
    }
    return pushRegistrationState?.ownerId === userId
      ? pushRegistrationState
      : {
          ownerId: userId,
          status: "registering",
          message: "Registering this device…",
        };
  }, [isEnabled, preferences.push, pushRegistrationState, userId]);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    activeAuthOwnerRef.current = userId;
  }, [userId]);

  useEffect(() => {
    const nextOwnerId = userId;
    if (notificationOwnerId.current === nextOwnerId) return;
    // A notification list is account-scoped. Clear every derived cache before
    // a new subscription/fetch starts so activity can never flash from the
    // previous account after logout or account switching.
    notificationOwnerId.current = nextOwnerId;
    notificationRequest.current += 1;
    knownNotificationIds.current.clear();
    shownAchievementIds.current.clear();
    pendingReadIds.current.clear();
    markingAllReadOwner.current = null;
    notificationsHydrated.current = false;
    setReadyNotificationState(null);
    setNotificationState({ ownerId: nextOwnerId, items: [] });
    setLoadingState({ ownerId: nextOwnerId, value: false });
    setPendingReadState({ ownerId: nextOwnerId, ids: [] });
    setMarkingAllReadState({ ownerId: nextOwnerId, value: false });
    setPreferences({ inApp: true, push: false });
    setPushRegistrationState(null);
    setError(null);
  }, [userId]);

  const showAchievementReady = useCallback(
    (ownerId: string, item: PatchNotification) => {
      if (
        notificationOwnerId.current !== ownerId ||
        item.type !== "achievement_completed" ||
        !item.achievement_id ||
        shownAchievementIds.current.has(item.achievement_id) ||
        pathnameRef.current === `/reveal/${item.achievement_id}`
      ) {
        return;
      }
      shownAchievementIds.current.add(item.achievement_id);
      setReadyNotificationState({ ownerId, item });
    },
    [],
  );

  const refreshPreferences = useCallback(async () => {
    const ownerId = session?.user.id;
    if (!ownerId) return;
    const { data, error: preferenceError } = await supabase
      .from("user_settings")
      .select("in_app_notifications, push_notifications")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (notificationOwnerId.current !== ownerId) return;
    if (data && !preferenceError) {
      setPreferences({
        inApp: data.in_app_notifications,
        push: data.push_notifications,
      });
    }
  }, [session]);

  const refresh = useCallback(async () => {
    const ownerId = session?.user.id;
    if (!ownerId) return;
    if (!preferences.inApp) {
      if (notificationOwnerId.current === ownerId) {
        setNotificationState({ ownerId, items: [] });
      }
      return;
    }
    const request = ++notificationRequest.current;
    // Existing activity stays interactive while a foreground refresh checks
    // for new rows; the large spinner made opening the bell feel stalled.
    const shouldShowLoading = !notificationsHydrated.current;
    if (shouldShowLoading) setLoadingState({ ownerId, value: true });
    try {
      const next = await getNotifications(ownerId);
      if (
        request !== notificationRequest.current ||
        notificationOwnerId.current !== ownerId
      ) {
        return;
      }
      if (notificationsHydrated.current) {
        const newCompletion = next.find(
          (item) =>
            !knownNotificationIds.current.has(item.id) &&
            item.type === "achievement_completed" &&
            item.read_at === null,
        );
        if (newCompletion && preferences.inApp) {
          showAchievementReady(ownerId, newCompletion);
        }
      }
      knownNotificationIds.current = new Set(next.map((item) => item.id));
      notificationsHydrated.current = true;
      setNotificationState({ ownerId, items: next });
      setError(null);
    } catch {
      if (
        request === notificationRequest.current &&
        notificationOwnerId.current === ownerId
      ) {
        setError("Could not load notifications. Pull to try again.");
      }
    } finally {
      if (
        shouldShowLoading &&
        request === notificationRequest.current &&
        notificationOwnerId.current === ownerId
      ) {
        setLoadingState({ ownerId, value: false });
      }
    }
  }, [preferences.inApp, session, showAchievementReady]);

  useEffect(() => {
    if (!session) return;
    const ownerId = session.user.id;
    const refreshTimer = setTimeout(() => {
      void refreshPreferences();
      void refresh();
    }, 0);

    const channel = supabase
      .channel(`mobile-notifications:${ownerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `owner_id=eq.${ownerId}`,
        },
        (payload) => {
          if (notificationOwnerId.current !== ownerId) return;
          const item = payload.new as PatchNotification;
          knownNotificationIds.current.add(item.id);
          if (preferences.inApp) {
            setNotificationState((current) =>
              current.ownerId === ownerId
                ? {
                    ownerId,
                    items: [
                      item,
                      ...current.items.filter((value) => value.id !== item.id),
                    ],
                  }
                : current,
            );
            showAchievementReady(ownerId, item);
          }
          if (item.type === "achievement_completed") {
            void invalidateForMutation(queryClient, "lifecycle");
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

  const refreshPushRegistration = useCallback(async () => {
    const ownerId = session?.user.id;
    if (
      !remotePushEnabled ||
      !ownerId ||
      !preferences.push ||
      !isEnabled("push_enabled")
    ) {
      return;
    }
    try {
      const result = await registerPushToken(
        ownerId,
        undefined,
        () => activeAuthOwnerRef.current === ownerId,
      );
      if (notificationOwnerId.current === ownerId) {
        setPushRegistrationState({ ownerId, ...result });
      }
    } catch {
      if (notificationOwnerId.current === ownerId) {
        setPushRegistrationState({
          ownerId,
          status: "failed",
          message: "Patch could not register this device. Try again later.",
        });
      }
    }
  }, [isEnabled, preferences.push, session]);

  useEffect(() => {
    if (
      !remotePushEnabled ||
      !session ||
      !preferences.push ||
      !isEnabled("push_enabled")
    ) {
      return;
    }
    const registrationTimer = setTimeout(() => {
      void refreshPushRegistration();
    }, 0);
    const subscription = Notifications.addPushTokenListener((token) => {
      const ownerId = session.user.id;
      void (async () => {
        try {
          // Expo documents this listener as receiving an APNs/FCM device
          // token. Convert it to an Expo token before our Expo-only backend
          // sees it; passing the native token through would break delivery.
          const result = await registerPushToken(
            ownerId,
            token,
            () => activeAuthOwnerRef.current === ownerId,
          );
          if (notificationOwnerId.current === ownerId) {
            setPushRegistrationState({ ownerId, ...result });
          }
        } catch {
          // Keep only a retry marker, never the native token, so foreground
          // registration can safely recover after an offline token rotation.
          await markPushTokenRefreshPending();
          if (notificationOwnerId.current === ownerId) {
            setPushRegistrationState({
              ownerId,
              status: "failed",
              message: "Patch could not update this device token.",
            });
          }
        }
      })();
    });
    return () => {
      clearTimeout(registrationTimer);
      subscription.remove();
    };
  }, [isEnabled, preferences.push, refreshPushRegistration, session]);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") {
          void refresh();
          void refreshPushRegistration();
        }
      },
    );
    return () => appStateSubscription.remove();
  }, [refresh, refreshPushRegistration]);

  useEffect(() => {
    if (!readyNotification) return;
    const timer = setTimeout(() => setReadyNotificationState(null), 6_000);
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

  const isMarkingRead = useCallback(
    (id: string) =>
      pendingReadState.ownerId === userId && pendingReadState.ids.includes(id),
    [pendingReadState, userId],
  );

  const markRead = useCallback(
    async (id: string) => {
      const ownerId = session?.user.id;
      if (!ownerId || pendingReadIds.current.has(id)) return;
      const previous = notificationState;
      if (previous.ownerId !== ownerId) return;

      pendingReadIds.current.add(id);
      setPendingReadState((current) =>
        current.ownerId === ownerId
          ? { ownerId, ids: [...current.ids, id] }
          : current,
      );
      setError(null);
      const now = new Date().toISOString();
      setNotificationState({
        ownerId,
        items: previous.items.map((item) =>
          item.id === id ? { ...item, read_at: now } : item,
        ),
      });

      try {
        const { error: mutationError } = await supabase
          .from("notifications")
          .update({ read_at: now })
          .eq("id", id)
          .eq("owner_id", ownerId);
        if (mutationError) throw mutationError;
        await refresh();
      } catch {
        if (notificationOwnerId.current === ownerId) {
          setNotificationState(previous);
          setError("Could not mark the notification as read. Try again.");
        }
      } finally {
        pendingReadIds.current.delete(id);
        setPendingReadState((current) =>
          current.ownerId === ownerId
            ? { ownerId, ids: current.ids.filter((value) => value !== id) }
            : current,
        );
      }
    },
    [notificationState, refresh, session],
  );

  const markAllRead = useCallback(async () => {
    const ownerId = session?.user.id;
    if (!ownerId || markingAllReadOwner.current === ownerId) return;
    const previous = notificationState;
    if (previous.ownerId !== ownerId) return;

    markingAllReadOwner.current = ownerId;
    setMarkingAllReadState({ ownerId, value: true });
    setError(null);
    const now = new Date().toISOString();
    setNotificationState({
      ownerId,
      items: previous.items.map((item) => ({
        ...item,
        read_at: item.read_at ?? now,
      })),
    });

    try {
      const { error: mutationError } = await supabase
        .from("notifications")
        .update({ read_at: now })
        .eq("owner_id", ownerId)
        .is("read_at", null);
      if (mutationError) throw mutationError;
      await refresh();
    } catch {
      if (notificationOwnerId.current === ownerId) {
        setNotificationState(previous);
        setError("Could not mark all notifications as read. Try again.");
      }
    } finally {
      if (markingAllReadOwner.current === ownerId) {
        markingAllReadOwner.current = null;
      }
      setMarkingAllReadState((current) =>
        current.ownerId === ownerId ? { ownerId, value: false } : current,
      );
    }
  }, [notificationState, refresh, session]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      loading,
      error,
      markingAllRead,
      refresh,
      markRead,
      markAllRead,
      isMarkingRead,
      refreshPreferences,
      pushRegistration,
    }),
    [
      error,
      isMarkingRead,
      loading,
      markAllRead,
      markRead,
      markingAllRead,
      notifications,
      refresh,
      refreshPreferences,
      pushRegistration,
      unreadCount,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {readyNotification ? (
        <AchievementReadyBanner
          notification={readyNotification}
          onDismiss={() => setReadyNotificationState(null)}
          onOpen={() => {
            const achievementId = readyNotification.achievement_id;
            const notificationId = readyNotification.id;
            setReadyNotificationState(null);
            void markRead(notificationId);
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
