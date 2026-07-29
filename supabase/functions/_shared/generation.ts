import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabasePublishableKey =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

export const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

export type GenerationRequest = {
  title: string;
  description: string;
  category: string;
  eventDate: string;
  targetDate?: string | null;
  visibility: string;
  rarity: string;
  lifecycleStatus: "locked" | "in_progress" | "completed";
  idempotencyKey: string;
};

export type ClaimedJob = {
  job_id: string;
  achievement_id: string;
  owner_id: string;
  attempt: number;
  lease_token: string;
  lease_expires_at: string;
  title: string;
  category: string;
  rarity: string;
  idempotency_key: string;
};

function requireEnvironment(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function userClient(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) throw new Error("Authentication required.");
  return createClient(
    requireEnvironment(supabaseUrl, "SUPABASE_URL"),
    requireEnvironment(
      supabasePublishableKey,
      "SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY",
    ),
    { global: { headers: { Authorization: authorization } } },
  );
}

export function serviceClient(): SupabaseClient {
  return createClient(
    requireEnvironment(supabaseUrl, "SUPABASE_URL"),
    requireEnvironment(supabaseServiceRoleKey, "SUPABASE_SERVICE_ROLE_KEY"),
  );
}

export function isServiceRequest(request: Request) {
  const authorization = request.headers.get("Authorization");
  const key = requireEnvironment(
    supabaseServiceRoleKey,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  return authorization === `Bearer ${key}`;
}

export async function requireUser(request: Request) {
  const client = userClient(request);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Authentication required.");
  return { client, user: data.user };
}

export function parseGenerationRequest(value: unknown): GenerationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A generation request body is required.");
  }
  const body = value as Record<string, unknown>;
  const text = (name: string, required = true) => {
    const candidate = body[name];
    if (typeof candidate !== "string") {
      if (!required && candidate == null) return "";
      throw new Error(`${name} must be text.`);
    }
    return candidate.trim();
  };
  const dateOrNull = (name: string) => {
    const candidate = body[name];
    if (candidate == null || candidate === "") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(candidate))) {
      throw new Error(`${name} must use YYYY-MM-DD.`);
    }
    return String(candidate);
  };
  const lifecycleStatus = text(
    "lifecycleStatus",
  ) as GenerationRequest["lifecycleStatus"];
  if (!["locked", "in_progress", "completed"].includes(lifecycleStatus)) {
    throw new Error("lifecycleStatus is invalid.");
  }

  const request: GenerationRequest = {
    title: text("title"),
    description: text("description"),
    category: text("category"),
    eventDate: text("eventDate"),
    targetDate: dateOrNull("targetDate"),
    visibility: text("visibility"),
    rarity: text("rarity"),
    lifecycleStatus,
    idempotencyKey: text("idempotencyKey"),
  };

  if (request.title.length < 2 || request.title.length > 80) {
    throw new Error("title must contain 2 to 80 characters.");
  }
  if (request.description.length < 2 || request.description.length > 600) {
    throw new Error("description must contain 2 to 600 characters.");
  }
  return request;
}

export function coverKeyFor(job: ClaimedJob) {
  return `${job.category}-${job.rarity}-${job.idempotency_key.slice(0, 8)}`;
}

export type GeneratedCover = {
  coverKey: string;
  provider: string;
};

export interface ImageGenerationProvider {
  generate(job: ClaimedJob): Promise<GeneratedCover>;
}

class FallbackCoverProvider implements ImageGenerationProvider {
  async generate(job: ClaimedJob): Promise<GeneratedCover> {
    return { coverKey: coverKeyFor(job), provider: "patch-deterministic" };
  }
}

class HttpImageGenerationProvider implements ImageGenerationProvider {
  constructor(
    private readonly endpoint: string,
    private readonly providerName: string,
  ) {}

  async generate(job: ClaimedJob): Promise<GeneratedCover> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        achievementId: job.achievement_id,
        title: job.title,
        category: job.category,
        rarity: job.rarity,
        idempotencyKey: job.idempotency_key,
      }),
    });
    if (!response.ok)
      throw new Error(`Image provider returned ${response.status}.`);
    const result = (await response.json()) as { coverKey?: unknown };
    if (typeof result.coverKey !== "string" || !result.coverKey.trim())
      throw new Error("Image provider returned no cover key.");
    return { coverKey: result.coverKey.trim(), provider: this.providerName };
  }
}

/**
 * A configured image provider is optional. Any transport or provider failure
 * resolves to the deterministic in-app cover so a generation job is never
 * stranded solely because artwork is unavailable.
 */
export async function generateCover(job: ClaimedJob): Promise<GeneratedCover> {
  const endpoint = Deno.env.get("PATCH_IMAGE_PROVIDER_URL")?.trim();
  if (!endpoint) return new FallbackCoverProvider().generate(job);
  const provider = new HttpImageGenerationProvider(
    endpoint,
    Deno.env.get("PATCH_IMAGE_PROVIDER_NAME")?.trim() || "configured-image",
  );
  try {
    return await provider.generate(job);
  } catch {
    return new FallbackCoverProvider().generate(job);
  }
}

export async function processQueuedJobs(limit = 1) {
  const client = serviceClient();
  const workerId = `process-achievement-jobs:${crypto.randomUUID()}`;
  const processed: Array<{
    achievementId: string;
    status: "completed" | "failed" | "lost_lease";
  }> = [];

  for (let index = 0; index < Math.min(Math.max(limit, 1), 6); index += 1) {
    const { data, error } = await client.rpc(
      "claim_achievement_generation_jobs",
      {
        p_limit: 1,
        p_worker_id: workerId,
        p_lease_seconds: 90,
      },
    );
    if (error) throw error;
    const job = (data?.[0] ?? null) as ClaimedJob | null;
    if (!job) break;

    try {
      const cover = await generateCover(job);
      const { data: completionResult, error: completionError } =
        await client.rpc("complete_achievement_generation_job", {
          p_job_id: job.job_id,
          p_lease_token: job.lease_token,
          p_cover_key: cover.coverKey,
          p_provider: cover.provider,
        });
      if (completionError) throw completionError;
      if (!completionResult) {
        processed.push({
          achievementId: job.achievement_id,
          status: "lost_lease",
        });
        continue;
      }
      processed.push({
        achievementId: job.achievement_id,
        status: "completed",
      });
    } catch (error) {
      const { data: failureResult, error: failureError } = await client.rpc(
        "fail_achievement_generation_job",
        {
          p_job_id: job.job_id,
          p_lease_token: job.lease_token,
          p_message:
            "The illustration service was unavailable. Patch will try again.",
          p_retryable: true,
        },
      );
      if (failureError) throw failureError;
      processed.push({
        achievementId: job.achievement_id,
        status: failureResult ? "failed" : "lost_lease",
      });
    }
  }

  return processed;
}

export function invokeQueueProcessor() {
  const url = requireEnvironment(supabaseUrl, "SUPABASE_URL");
  const key = requireEnvironment(
    supabaseServiceRoleKey,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  return fetch(`${url}/functions/v1/process-achievement-jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ limit: 1 }),
  });
}
