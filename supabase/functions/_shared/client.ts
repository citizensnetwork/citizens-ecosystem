// supabase/functions/_shared/client.ts
// Shared Supabase service-role client factory for Edge Functions.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Default notification radius in kilometres when user hasn't set one. */
export const DEFAULT_NOTIFICATION_RADIUS_KM = 50;

/**
 * Create a Supabase client with the service role key.
 * Throws a descriptive error if env vars are missing.
 */
export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    throw new Error(
      "Missing required env vars: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
