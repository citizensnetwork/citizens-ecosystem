import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (client) return client;

  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Shared Citizens project: scope PostgREST to the `vision` schema. Cast back
    // to the default client type (queries are untyped either way) so consumers
    // typed against the standard SupabaseClient keep working.
    { db: { schema: "vision" } }
  ) as unknown as SupabaseClient;

  return client;
}
