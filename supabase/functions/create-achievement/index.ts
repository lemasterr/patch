import {
  corsHeaders,
  invokeQueueProcessor,
  json,
  parseGenerationRequest,
  requireUser,
} from "../_shared/generation.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return json({ error: "Method not allowed." }, 405);

  try {
    const { client } = await requireUser(request);
    const input = parseGenerationRequest(await request.json());
    const { data, error } = await client.rpc("create_patch_v2", {
      p_title: input.title,
      p_description: input.description,
      p_category: input.category,
      p_rarity: input.rarity,
      p_visibility: input.visibility,
      p_lifecycle_status: input.lifecycleStatus,
      p_event_date: input.eventDate,
      p_target_date: input.targetDate ?? null,
      p_operation_id: input.idempotencyKey,
    });
    if (error) throw error;
    const result = data?.[0];
    if (!result)
      throw new Error("The generation queue did not return an achievement.");

    if (result.job_id) {
      EdgeRuntime.waitUntil(invokeQueueProcessor().catch(() => undefined));
    }
    return json(
      {
        achievementId: result.achievement_id,
        jobId: result.job_id,
        lifecycleStatus: result.lifecycle_status,
        generationStatus: result.generation_status,
      },
      result.was_existing ? 200 : 202,
    );
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not queue achievement generation.",
      },
      400,
    );
  }
});
