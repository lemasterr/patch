import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import * as Linking from "expo-linking";

import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";
import {
  clearPendingPushDisable,
  clearRegisteredPushToken,
  getRegisteredPushDevice,
  recordPendingPushDisable,
} from "@/lib/push-token";

jest.mock("expo-linking", () => ({
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  getInitialURL: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/supabase", () => ({
  supabaseConfigurationError: null,
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      exchangeCodeForSession: jest.fn(),
      setSession: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock("@/lib/push-token", () => ({
  clearPendingPushDisable: jest.fn(),
  clearRegisteredPushToken: jest.fn(),
  getRegisteredPushDevice: jest.fn(),
  recordPendingPushDisable: jest.fn(),
}));

const mockedSupabase = supabase as unknown as {
  auth: {
    getSession: jest.Mock;
    onAuthStateChange: jest.Mock;
    exchangeCodeForSession: jest.Mock;
    setSession: jest.Mock;
    signOut: jest.Mock;
  };
  from: jest.Mock;
  rpc: jest.Mock;
};
const mockedGetPushDevice = getRegisteredPushDevice as jest.Mock;
const mockedClearPushToken = clearRegisteredPushToken as jest.Mock;
const mockedRecordPendingPushDisable = recordPendingPushDisable as jest.Mock;
const mockedClearPendingPushDisable = clearPendingPushDisable as jest.Mock;
const mockedLinking = Linking as unknown as {
  addEventListener: jest.Mock;
  getInitialURL: jest.Mock;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function AuthProbe() {
  const { loading, profile, profileLoadError, session, signOut } = useAuth();
  return (
    <>
      <Text testID="session">{session?.user.id ?? "signed-out"}</Text>
      <Text testID="profile">{profile?.username ?? "no-profile"}</Text>
      <Text testID="profile-error">{profileLoadError ?? "no-error"}</Text>
      <Text testID="loading">{loading ? "loading" : "ready"}</Text>
      <Pressable testID="sign-out" onPress={() => void signOut()} />
    </>
  );
}

async function renderProvider() {
  await act(async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    // AuthProvider initializes its session asynchronously. Keeping this
    // flush within act makes the test assert the settled, user-visible state.
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("AuthProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    });
    mockedSupabase.auth.exchangeCodeForSession.mockResolvedValue({
      error: null,
    });
    mockedSupabase.auth.setSession.mockResolvedValue({ error: null });
    mockedLinking.getInitialURL.mockResolvedValue(null);
    mockedSupabase.auth.signOut.mockResolvedValue({ error: null });
    mockedSupabase.rpc.mockResolvedValue({ data: [], error: null });
    mockedGetPushDevice.mockResolvedValue(null);
    mockedClearPushToken.mockResolvedValue(undefined);
    mockedRecordPendingPushDisable.mockResolvedValue(undefined);
    mockedClearPendingPushDisable.mockResolvedValue(undefined);
  });

  it("keeps an authenticated session out of onboarding when profile loading fails", async () => {
    const session = { user: { id: "user-a" } };
    mockedSupabase.auth.getSession.mockResolvedValue({
      data: { session },
      error: null,
    });
    mockedSupabase.rpc.mockResolvedValue({
      data: null,
      error: new Error("network unavailable"),
    });

    await renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("session")).toHaveTextContent("user-a");
      expect(screen.getByTestId("profile")).toHaveTextContent("no-profile");
      expect(screen.getByTestId("profile-error")).toHaveTextContent(
        /Could not load/,
      );
      expect(screen.getByTestId("loading")).toHaveTextContent("ready");
    });
  });

  it("disables the current installation before clearing its local session", async () => {
    const session = { user: { id: "user-a" } };
    const device = {
      ownerId: "user-a",
      installationId: "install-abc123def456",
      expoPushToken: "ExpoPushToken[redacted]",
    };
    mockedSupabase.auth.getSession.mockResolvedValue({
      data: { session },
      error: null,
    });
    mockedGetPushDevice.mockResolvedValue(device);
    mockedSupabase.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("session")).toHaveTextContent("user-a"),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("sign-out"));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(mockedSupabase.auth.signOut).toHaveBeenCalledWith({
        scope: "local",
      });
      expect(mockedRecordPendingPushDisable).toHaveBeenCalledWith({
        ownerId: "user-a",
        installationId: "install-abc123def456",
      });
      expect(mockedSupabase.rpc).toHaveBeenLastCalledWith(
        "disable_push_installation",
        { p_installation_id: "install-abc123def456" },
      );
      expect(screen.getByTestId("session")).toHaveTextContent("signed-out");
      expect(screen.getByTestId("profile")).toHaveTextContent("no-profile");
    });
    await waitFor(() => expect(mockedClearPushToken).toHaveBeenCalledTimes(1));
    expect(mockedClearPendingPushDisable).toHaveBeenCalledTimes(1);
  });

  it("does not restore a stale session after local sign out", async () => {
    const session = { user: { id: "user-a" } };
    const initialSession = deferred<{
      data: { session: typeof session };
      error: null;
    }>();
    mockedSupabase.auth.getSession.mockReturnValue(initialSession.promise);

    await renderProvider();
    await act(async () => {
      fireEvent.press(screen.getByTestId("sign-out"));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByTestId("session")).toHaveTextContent("signed-out"),
    );

    await act(async () => {
      initialSession.resolve({ data: { session }, error: null });
      await initialSession.promise;
    });

    expect(screen.getByTestId("session")).toHaveTextContent("signed-out");
    expect(mockedSupabase.rpc).not.toHaveBeenCalled();
  });

  it("processes a repeated auth callback only once", async () => {
    let callback: ((event: { url: string }) => void) | undefined;
    mockedSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockedLinking.addEventListener.mockImplementation(
      (_event: string, listener: (event: { url: string }) => void) => {
        callback = listener;
        return { remove: jest.fn() };
      },
    );

    await renderProvider();
    const url = "patch://auth/callback?code=single-use-code&type=signup";
    await act(async () => {
      callback?.({ url });
      callback?.({ url });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedSupabase.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mockedSupabase.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      "single-use-code",
    );
  });
});
