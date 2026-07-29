import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  json,
  requireUser,
  serviceClient,
} from "../_shared/generation.ts";

const url = Deno.env.get("SUPABASE_URL");
const publishable =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return json({ error: "Method not allowed." }, 405);
  try {
    const { user } = await requireUser(request);
    const body = (await request.json().catch(() => null)) as {
      confirmation?: unknown;
      password?: unknown;
    } | null;
    if (
      body?.confirmation !== "DELETE" ||
      typeof body.password !== "string" ||
      !body.password
    ) {
      return json(
        { error: "Confirm DELETE and provide your current password." },
        400,
      );
    }
    if (!url || !publishable || !user.email)
      return json({ error: "Account deletion is not configured." }, 503);
    // Reauthenticate with a disposable client; the service credential never
    // receives a password and the input is intentionally never logged.
    const verifier = createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: verified, error: verificationError } =
      await verifier.auth.signInWithPassword({
        email: user.email,
        password: body.password,
      });
    if (verificationError || verified.user?.id !== user.id)
      return json({ error: "Current password could not be verified." }, 403);
    const admin = serviceClient();
    // The UI promises permanent deletion. `true` is a Supabase soft delete and
    // leaves the auth row (and therefore its dependent application data)
    // retained, so use the hard-delete contract after password verification.
    const { error } = await admin.auth.admin.deleteUser(user.id, false);
    if (error) throw error;
    return json({ deleted: true });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Could not delete account.",
      },
      400,
    );
  }
});
