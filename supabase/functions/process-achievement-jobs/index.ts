import {
  corsHeaders,
  isServiceRequest,
  json,
  processQueuedJobs,
} from "../_shared/generation.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    if (!isServiceRequest(request)) {
      return json({ error: "Service authorization is required." }, 401);
    }
    const body = await request.json().catch(() => ({}));
    const requestedLimit = typeof body.limit === "number" ? body.limit : 1;
    const processed = await processQueuedJobs(requestedLimit);
    return json({ processed });
  } catch {
    console.error("Achievement job worker failed.");
    return json({ error: "Could not process jobs." }, 500);
  }
});
