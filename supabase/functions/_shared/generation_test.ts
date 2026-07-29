import {
  ClientRequestError,
  coverKeyFor,
  parseGenerationRequest,
} from "./generation.ts";

Deno.test(
  "generation requests reject malformed input without reaching Supabase",
  () => {
    let thrown: unknown;
    try {
      parseGenerationRequest({ title: "x" });
    } catch (error) {
      thrown = error;
    }
    if (!(thrown instanceof ClientRequestError)) {
      throw new Error("Malformed request did not produce a client error.");
    }
  },
);

Deno.test("generation requests preserve a valid idempotency key", () => {
  const result = parseGenerationRequest({
    title: "Finished the trail",
    description: "A quiet hike before sunset.",
    category: "travel",
    eventDate: "2026-07-29",
    visibility: "public",
    rarity: "common",
    lifecycleStatus: "completed",
    idempotencyKey: "abcd1234-0000-4000-8000-000000000000",
  });
  if (result.idempotencyKey !== "abcd1234-0000-4000-8000-000000000000") {
    throw new Error("Idempotency key was not preserved.");
  }
  if (
    coverKeyFor({
      job_id: "job",
      achievement_id: "patch",
      owner_id: "owner",
      attempt: 1,
      lease_token: "lease",
      lease_expires_at: "2026-07-29T00:00:00.000Z",
      title: result.title,
      category: result.category,
      rarity: result.rarity,
      idempotency_key: result.idempotencyKey,
    }) !== "travel-common-abcd1234"
  ) {
    throw new Error("Cover key is not deterministic.");
  }
});
