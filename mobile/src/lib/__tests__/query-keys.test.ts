import { QueryClient } from "@tanstack/react-query";

import {
  invalidateQueryRoots,
  queryInvalidation,
  queryKeys,
} from "../query-keys";

describe("query key contract", () => {
  it("keeps category deep-link collection keys distinct", () => {
    expect(
      queryKeys.collection.list({
        ownerId: "u",
        lifecycle: "completed",
        category: "travel",
      }),
    ).not.toEqual(
      queryKeys.collection.list({
        ownerId: "u",
        lifecycle: "completed",
        category: "health",
      }),
    );
  });
  it("invalidates every surface affected by a block", () => {
    expect(queryInvalidation.block).toEqual(
      expect.arrayContaining(["profile", "patch", "discover", "social"]),
    );
  });

  it("invalidates each requested root instead of one composite query key", async () => {
    const client = new QueryClient();
    client.setQueryData(["profile", "public", "a"], { id: "a" });
    client.setQueryData(["social", "friends", "a"], []);
    await invalidateQueryRoots(client, ["profile", "social"]);
    expect(
      client.getQueryState(["profile", "public", "a"])?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(["social", "friends", "a"])?.isInvalidated,
    ).toBe(true);
    client.clear();
  });
});
