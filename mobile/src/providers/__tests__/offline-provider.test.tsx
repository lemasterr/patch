import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { listOperationResults, listOperations } from "@/lib/offline/database";
import { OfflineProvider, useOffline } from "@/providers/offline-provider";
import { useAuth } from "@/providers/auth-provider";

jest.mock("@/providers/auth-provider", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/offline/cache-persister", () => ({
  clearPersistedQueryCache: jest.fn().mockResolvedValue(undefined),
  hydrateQueryCache: jest.fn().mockResolvedValue(false),
  persistQueryCache: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/offline/create-draft", () => ({
  clearCreateDraft: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/offline/operation-handlers", () => ({
  executeOfflineOperation: jest.fn(),
}));
jest.mock("@/lib/offline/database", () => ({
  claimNextOperation: jest.fn().mockResolvedValue(null),
  clearOfflineUserData: jest.fn().mockResolvedValue(undefined),
  completeOperation: jest.fn().mockResolvedValue(undefined),
  consumeOperationResult: jest.fn().mockResolvedValue(null),
  countOperations: (
    operations:
      | {
          state: "pending" | "running" | "failed" | "dead";
        }[]
      | undefined,
  ) =>
    (operations ?? []).reduce<
      Record<"pending" | "running" | "failed" | "dead", number>
    >(
      (counts, operation) => {
        counts[operation.state] += 1;
        return counts;
      },
      { pending: 0, running: 0, failed: 0, dead: 0 },
    ),
  discardOperation: jest.fn().mockResolvedValue(undefined),
  enqueueOperation: jest.fn().mockResolvedValue(undefined),
  failOperation: jest.fn().mockResolvedValue(undefined),
  listOperationResults: jest.fn(),
  listOperations: jest.fn(),
  reclaimStalledOperations: jest.fn().mockResolvedValue(undefined),
  releaseOperation: jest.fn().mockResolvedValue(undefined),
  retryOperation: jest.fn().mockResolvedValue(undefined),
}));

const mockedListOperations = listOperations as jest.Mock;
const mockedListOperationResults = listOperationResults as jest.Mock;
const mockedUseAuth = useAuth as jest.Mock;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function OfflineProbe() {
  const { completedResults, operations } = useOffline();
  return (
    <>
      <Text testID="operations">
        {operations.map((operation) => operation.id).join(",") || "empty"}
      </Text>
      <Text testID="results">
        {completedResults.map((result) => result.operationId).join(",") ||
          "empty"}
      </Text>
    </>
  );
}

describe("OfflineProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onlineManager.setOnline(false);
  });

  afterEach(async () => {
    await act(async () => {
      onlineManager.setOnline(true);
    });
  });

  it("never exposes an old account's queue while the next account is loading", async () => {
    const accountA = { user: { id: "account-a" } };
    const accountB = { user: { id: "account-b" } };
    const accountBOperations = deferred<unknown[]>();
    const accountBResults = deferred<unknown[]>();
    let session = accountA;
    mockedUseAuth.mockImplementation(() => ({ session }));
    mockedListOperations
      .mockResolvedValueOnce([
        {
          id: "a-operation",
          state: "pending",
        },
      ])
      .mockReturnValueOnce(accountBOperations.promise);
    mockedListOperationResults
      .mockResolvedValueOnce([
        {
          operationId: "a-result",
          result: { achievementId: "a-patch" },
        },
      ])
      .mockReturnValueOnce(accountBResults.promise);

    const client = new QueryClient();
    let view!: Awaited<ReturnType<typeof render>>;
    await act(async () => {
      view = await render(
        <QueryClientProvider client={client}>
          <OfflineProvider>
            <OfflineProbe />
          </OfflineProvider>
        </QueryClientProvider>,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(screen.getByTestId("operations")).toHaveTextContent("a-operation");
      expect(screen.getByTestId("results")).toHaveTextContent("a-result");
    });

    session = accountB;
    await act(async () => {
      view.rerender(
        <QueryClientProvider client={client}>
          <OfflineProvider>
            <OfflineProbe />
          </OfflineProvider>
        </QueryClientProvider>,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId("operations")).toHaveTextContent("empty");
    expect(screen.getByTestId("results")).toHaveTextContent("empty");

    await act(async () => {
      accountBOperations.resolve([]);
      accountBResults.resolve([]);
      await Promise.all([accountBOperations.promise, accountBResults.promise]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      view.unmount();
    });
    client.clear();
  });
});
