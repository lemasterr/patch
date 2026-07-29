import { nextOperationFailure } from "../database";

describe("offline retry backoff", () => {
  const now = new Date("2026-07-26T10:00:00.000Z");

  it("backs off retryable work and caps the retry delay", () => {
    expect(nextOperationFailure(1, true, now)).toEqual({
      state: "failed",
      nextAttemptAt: "2026-07-26T10:00:01.000Z",
    });
    expect(nextOperationFailure(20, true, now).nextAttemptAt).toBe(
      "2026-07-26T11:00:00.000Z",
    );
  });

  it("does not retry permanent failures or exhausted work", () => {
    expect(nextOperationFailure(1, false, now).state).toBe("dead");
    expect(nextOperationFailure(7, true, now).state).toBe("dead");
  });
});
