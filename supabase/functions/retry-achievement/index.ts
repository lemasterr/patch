import {
  AuthenticationError,
  corsHeaders,
  invokeQueueProcessor,
  json,
  requireUser,
} from "../_shared/generation.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const { client } = await requireUser(request);
    const body = await request.json();
    if (!body || typeof body.achievementId !== "string") {
      return json({ error: "achievementId is required." }, 400);
    }
    const { data: jobId, error } = await client.rpc(
      "retry_achievement_generation",
      {
        p_achievement_id: body.achievementId,
      },
    );
    if (error || !jobId) throw error ?? new Error("Could not queue retry.");

    EdgeRuntime.waitUntil(invokeQueueProcessor().catch(() => undefined));
    return json({ jobId, status: "processing" }, 202);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return json({ error: error.message }, 401);
    }
    return json(
      { error: "Could not retry this Patch. Please try again." },
      500,
    );
  }
});
