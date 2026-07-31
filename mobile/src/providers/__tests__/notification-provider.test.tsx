import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import {
  NotificationProvider,
  usePatchNotifications,
} from "@/providers/notification-provider";
import { getNotifications } from "@/lib/queries";
import { useAuth } from "@/providers/auth-provider";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  setBadgeCountAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-constants", () => ({ expoConfig: null, easConfig: null }));
jest.mock("expo-device", () => ({ isDevice: false }));
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  usePathname: () => "/notifications",
}));

jest.mock("@/lib/queries", () => ({ getNotifications: jest.fn() }));
jest.mock("@/providers/auth-provider", () => ({ useAuth: jest.fn() }));
jest.mock("@/providers/feature-flag-provider", () => {
  const isEnabled = () => true;
  return { useFeatureFlags: () => ({ isEnabled }) };
});
jest.mock("@/lib/push-token", () => ({
  clearPendingPushDisable: jest.fn(),
  clearPushTokenRefreshPending: jest.fn(),
  getPushInstallationId: jest.fn().mockResolvedValue("install-abc123def456"),
  markPushTokenRefreshPending: jest.fn(),
  setRegisteredPushDevice: jest.fn(),
}));
jest.mock("@/lib/supabase", () => {
  const channel = {} as { on: jest.Mock; subscribe: jest.Mock };
  channel.on = jest.fn(() => channel);
  channel.subscribe = jest.fn(() => channel);
  return {
    supabase: {
      channel: jest.fn(() => channel),
      removeChannel: jest.fn().mockResolvedValue(undefined),
      rpc: jest.fn(),
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { in_app_notifications: true, push_notifications: false },
              error: null,
            }),
          })),
        })),
      })),
    },
  };
});

const mockedGetNotifications = getNotifications as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function NotificationProbe() {
  const { notifications, refresh } = usePatchNotifications();
  return (
    <>
      <Text testID="notifications">
        {notifications.map((notification) => notification.title).join(",") ||
          "empty"}
      </Text>
      <Pressable testID="refresh" onPress={() => void refresh()} />
    </>
  );
}

function fixture(id: string, title: string) {
  return {
    id,
    type: "achievement_liked" as const,
    achievement_id: null,
    title,
    body: title,
    link: "/notifications",
    read_at: null,
    created_at: "2026-07-29T00:00:00.000Z",
  };
}

describe("NotificationProvider", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("never exposes account A notifications while account B is loading", async () => {
    const accountA = { user: { id: "account-a" } };
    const accountB = { user: { id: "account-b" } };
    const staleA = deferred<ReturnType<typeof fixture>[]>();
    const accountBNotifications = deferred<ReturnType<typeof fixture>[]>();
    let session = accountA;
    mockedUseAuth.mockImplementation(() => ({ session }));
    mockedGetNotifications
      .mockResolvedValueOnce([fixture("a-1", "From account A")])
      .mockReturnValueOnce(staleA.promise)
      .mockReturnValueOnce(accountBNotifications.promise);

    const client = new QueryClient();
    let view!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      view = await render(
        <QueryClientProvider client={client}>
          <NotificationProvider>
            <NotificationProbe />
          </NotificationProvider>
        </QueryClientProvider>,
      );
      await jest.advanceTimersByTimeAsync(0);
    });

    await waitFor(() =>
      expect(screen.getByTestId("notifications")).toHaveTextContent(
        "From account A",
      ),
    );
    fireEvent.press(screen.getByTestId("refresh"));
    await waitFor(() =>
      expect(mockedGetNotifications).toHaveBeenCalledTimes(2),
    );

    session = accountB;
    await act(async () => {
      view.rerender(
        <QueryClientProvider client={client}>
          <NotificationProvider>
            <NotificationProbe />
          </NotificationProvider>
        </QueryClientProvider>,
      );
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId("notifications")).toHaveTextContent("empty");

    await act(async () => {
      staleA.resolve([fixture("a-2", "Late account A")]);
      await staleA.promise;
    });
    expect(screen.getByTestId("notifications")).toHaveTextContent("empty");

    await waitFor(() =>
      expect(mockedGetNotifications).toHaveBeenCalledTimes(3),
    );
    await act(async () => {
      accountBNotifications.resolve([fixture("b-1", "From account B")]);
      await accountBNotifications.promise;
    });
    await waitFor(() =>
      expect(screen.getByTestId("notifications")).toHaveTextContent(
        "From account B",
      ),
    );
    await act(async () => {
      view.unmount();
    });
    client.clear();
  });
});
