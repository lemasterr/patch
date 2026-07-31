import type { OfflineOperation } from "@/lib/offline/database";
import { executeOfflineOperation } from "@/lib/offline/operation-handlers";
import { supabase } from "@/lib/supabase";

jest.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    rpc: jest.fn(),
  },
}));

const mockedRpc = supabase.rpc as jest.Mock;

function operation(
  overrides: Partial<OfflineOperation> = {},
): OfflineOperation {
  return {
    id: "queue-item",
    userId: "user-a",
    operationType: "apply_discover_action",
    payload: {
      args: { p_achievement_id: "patch-a", p_action: "like" },
      rpcName: "set_user_time_zone",
    },
    idempotencyKey: "operation-a",
    state: "pending",
    attempt: 0,
    nextAttemptAt: "2026-07-31T00:00:00.000Z",
    lastErrorCode: null,
    leaseExpiresAt: null,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

describe("offline operation handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRpc.mockResolvedValue({ error: null });
  });

  it("replays Discover feedback through its fixed RPC, never a stored rpcName", async () => {
    await executeOfflineOperation(operation());

    expect(mockedRpc).toHaveBeenCalledWith("apply_discover_feedback_v2", {
      p_achievement_id: "patch-a",
      p_action: "like",
      p_operation_id: "operation-a",
    });
  });

  it("rejects malformed queued Discover input before issuing an RPC", async () => {
    await expect(
      executeOfflineOperation(
        operation({ payload: { args: { p_achievement_id: "patch-a" } } }),
      ),
    ).rejects.toThrow("Invalid queued Discover action.");

    expect(mockedRpc).not.toHaveBeenCalled();
  });
});
