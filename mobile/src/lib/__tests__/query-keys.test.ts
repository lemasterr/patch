import { QueryClient } from "@tanstack/react-query";

import {
  invalidateForMutation,
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

  it("scopes RLS-sensitive query keys to the viewing account", () => {
    expect(queryKeys.patch.detail("account-a", "patch")).not.toEqual(
      queryKeys.patch.detail("account-b", "patch"),
    );
    expect(queryKeys.social.requests("account-a")).not.toEqual(
      queryKeys.social.requests("account-b"),
    );
    expect(queryKeys.discover.history("account-a")).not.toEqual(
      queryKeys.discover.history("account-b"),
    );
  });

  it("invalidates each requested root instead of one composite query key", async () => {
    const client = new QueryClient();
    const profileKey = queryKeys.profile.public("viewer", "a");
    const friendsKey = queryKeys.social.friends("viewer");
    client.setQueryData(profileKey, { id: "a" });
    client.setQueryData(friendsKey, []);
    await invalidateQueryRoots(client, ["profile", "social"]);
    expect(client.getQueryState(profileKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(friendsKey)?.isInvalidated).toBe(true);
    await invalidateForMutation(client, "friend");
    expect(client.getQueryState(profileKey)?.isInvalidated).toBe(true);
    client.clear();
  });
});
