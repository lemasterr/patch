import { defaultFeatureFlags, resolveFeatureFlags } from "../feature-flags";

jest.mock("expo-sqlite/kv-store", () => ({
  getItem: jest.fn(),
  removeItem: jest.fn(),
  setItem: jest.fn(),
}));

describe("feature flag resolution", () => {
  it("honors a remotely disabled released feature", () => {
    const result = resolveFeatureFlags(
      [{ key: "patch_creation_enabled", enabled: false }],
      null,
    );

    expect(result.source).toBe("remote");
    expect(result.flags.patch_creation_enabled).toBe(false);
    expect(result.flags.travel_enabled).toBe(true);
  });

  it("uses a stale account-scoped cache until it expires", () => {
    const now = Date.UTC(2026, 6, 29, 12);
    const stale = resolveFeatureFlags(
      null,
      {
        version: 1,
        savedAt: now - 10 * 60 * 1_000,
        flags: { ...defaultFeatureFlags, discover_enabled: false },
      },
      now,
    );
    const expired = resolveFeatureFlags(
      null,
      {
        version: 1,
        savedAt: now - 8 * 24 * 60 * 60 * 1_000,
        flags: { ...defaultFeatureFlags, discover_enabled: false },
      },
      now,
    );

    expect(stale).toMatchObject({
      source: "stale-cache",
      flags: { discover_enabled: false },
    });
    expect(expired).toMatchObject({
      source: "default",
      flags: { discover_enabled: true },
    });
  });
});
