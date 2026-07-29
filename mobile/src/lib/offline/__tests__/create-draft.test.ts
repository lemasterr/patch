import Storage from "expo-sqlite/kv-store";

import {
  clearCreateDraft,
  loadCreateDraft,
  saveCreateDraft,
} from "../create-draft";

jest.mock("expo-sqlite/kv-store", () => ({
  getItem: jest.fn(),
  removeItem: jest.fn(),
  setItem: jest.fn(),
}));

const storage = Storage as jest.Mocked<typeof Storage>;
const draft = {
  title: "Finished the trail",
  description: "A quiet hike before sunset.",
  category: "travel" as const,
  rarity: "common" as const,
  visibility: "public" as const,
  eventDate: "2026-07-29",
};

describe("create Patch drafts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps drafts account-scoped and restores a valid draft", async () => {
    storage.getItem.mockResolvedValue(JSON.stringify({ ...draft, version: 1 }));

    await expect(loadCreateDraft("account-a")).resolves.toEqual(draft);
    expect(storage.getItem).toHaveBeenCalledWith(
      "patch:create-draft:v1:account-a",
    );

    await saveCreateDraft("account-b", draft);
    expect(storage.setItem).toHaveBeenCalledWith(
      "patch:create-draft:v1:account-b",
      JSON.stringify({ ...draft, version: 1 }),
    );
  });

  it("removes malformed and empty drafts instead of restoring stale data", async () => {
    storage.getItem.mockResolvedValue("not json");
    await expect(loadCreateDraft("account-a")).resolves.toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(
      "patch:create-draft:v1:account-a",
    );

    await saveCreateDraft("account-b", {
      ...draft,
      title: "",
      description: "",
    });
    await clearCreateDraft("account-b");
    expect(storage.removeItem).toHaveBeenLastCalledWith(
      "patch:create-draft:v1:account-b",
    );
  });
});
