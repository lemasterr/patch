import Storage from "expo-sqlite/kv-store";

import type { AchievementCategory, AchievementRarity } from "@/types/domain";

const DRAFT_VERSION = 1;

export type CreatePatchDraft = {
  title: string;
  description: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  visibility: "public" | "private";
  eventDate: string;
};

type StoredDraft = CreatePatchDraft & { version: number };

const categories = new Set<AchievementCategory>([
  "adventure",
  "creativity",
  "everyday",
  "funny",
  "other",
  "social",
  "health",
  "learning",
  "personal",
  "travel",
  "work",
]);
const rarities = new Set<AchievementRarity>(["common", "rare", "legendary"]);

function draftKey(userId: string) {
  return `patch:create-draft:v${DRAFT_VERSION}:${userId}`;
}

function isDraft(value: unknown): value is StoredDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<StoredDraft>;
  return (
    draft.version === DRAFT_VERSION &&
    typeof draft.title === "string" &&
    typeof draft.description === "string" &&
    typeof draft.eventDate === "string" &&
    categories.has(draft.category as AchievementCategory) &&
    rarities.has(draft.rarity as AchievementRarity) &&
    (draft.visibility === "public" || draft.visibility === "private")
  );
}

export async function loadCreateDraft(userId: string) {
  const key = draftKey(userId);
  const raw = await Storage.getItem(key);
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as unknown;
    if (!isDraft(draft)) {
      await Storage.removeItem(key);
      return null;
    }
    const { version: _version, ...rest } = draft;
    return rest;
  } catch {
    await Storage.removeItem(key);
    return null;
  }
}

export async function saveCreateDraft(userId: string, draft: CreatePatchDraft) {
  const key = draftKey(userId);
  if (!draft.title.trim() && !draft.description.trim()) {
    await Storage.removeItem(key);
    return;
  }
  await Storage.setItem(
    key,
    JSON.stringify({ ...draft, version: DRAFT_VERSION }),
  );
}

export async function clearCreateDraft(userId: string) {
  await Storage.removeItem(draftKey(userId));
}
