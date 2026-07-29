import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";
import {
  clearRegisteredPushToken,
  getRegisteredPushToken,
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
      signOut: jest.fn(),
    },
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock("@/lib/push-token", () => ({
  clearRegisteredPushToken: jest.fn(),
  getRegisteredPushToken: jest.fn(),
}));

const mockedSupabase = supabase as unknown as {
  auth: {
    getSession: jest.Mock;
    onAuthStateChange: jest.Mock;
    signOut: jest.Mock;
  };
  from: jest.Mock;
  rpc: jest.Mock;
};
const mockedGetPushToken = getRegisteredPushToken as jest.Mock;
const mockedClearPushToken = clearRegisteredPushToken as jest.Mock;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function profileQuery(result: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  return { select };
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
    mockedSupabase.auth.signOut.mockResolvedValue({ error: null });
    mockedSupabase.rpc.mockResolvedValue({ error: null });
    mockedGetPushToken.mockResolvedValue(null);
    mockedClearPushToken.mockResolvedValue(undefined);
  });

  it("keeps an authenticated session out of onboarding when profile loading fails", async () => {
    const session = { user: { id: "user-a" } };
    mockedSupabase.auth.getSession.mockResolvedValue({
      data: { session },
      error: null,
    });
    mockedSupabase.from.mockReturnValue(
      profileQuery({ data: null, error: new Error("network unavailable") }),
    );

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

  it("clears local account state without awaiting push-device cleanup", async () => {
    const session = { user: { id: "user-a" } };
    let resolveDisable: ((value: { error: null }) => void) | undefined;
    mockedSupabase.auth.getSession.mockResolvedValue({
      data: { session },
      error: null,
    });
    mockedSupabase.from.mockReturnValue(
      profileQuery({ data: null, error: null }),
    );
    mockedGetPushToken.mockResolvedValue("ExponentPushToken[redacted]");
    mockedSupabase.rpc.mockImplementation(
      () =>
        new Promise<{ error: null }>((resolve) => {
          resolveDisable = resolve;
        }),
    );

    await renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId("session")).toHaveTextContent("user-a"),
    );
    fireEvent.press(screen.getByTestId("sign-out"));
    await waitFor(() => {
      expect(mockedSupabase.auth.signOut).toHaveBeenCalledWith({
        scope: "local",
      });
      expect(screen.getByTestId("session")).toHaveTextContent("signed-out");
      expect(screen.getByTestId("profile")).toHaveTextContent("no-profile");
    });

    resolveDisable?.({ error: null });
    await waitFor(() => expect(mockedClearPushToken).toHaveBeenCalledTimes(1));
  });

  it("does not restore a stale session after local sign out", async () => {
    const session = { user: { id: "user-a" } };
    const initialSession = deferred<{
      data: { session: typeof session };
      error: null;
    }>();
    mockedSupabase.auth.getSession.mockReturnValue(initialSession.promise);

    await renderProvider();
    fireEvent.press(screen.getByTestId("sign-out"));
    await waitFor(() =>
      expect(screen.getByTestId("session")).toHaveTextContent("signed-out"),
    );

    await act(async () => {
      initialSession.resolve({ data: { session }, error: null });
      await initialSession.promise;
    });

    expect(screen.getByTestId("session")).toHaveTextContent("signed-out");
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });
});
