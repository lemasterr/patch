import {
  isServiceRequest,
  json,
  processPushDeliveries,
} from "../_shared/push.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  if (request.method !== "POST")
    return json({ error: "Method not allowed." }, 405);
  if (!isServiceRequest(request))
    return json({ error: "Service authorization is required." }, 401);
  try {
    const body = await request.json().catch(() => ({}));
    const limit = typeof body.limit === "number" ? body.limit : 50;
    return json(await processPushDeliveries(limit));
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not process push deliveries.",
      },
      500,
    );
  }
});
