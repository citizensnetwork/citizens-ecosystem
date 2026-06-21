import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Vision lives in the shared Citizens project under the `vision` schema.
      // Every PostgREST query resolves to `vision.*`; Connect's commons data is
      // read over /api/v1, never via raw cross-schema table access.
      db: { schema: "vision" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method is called from a Server Component.
            // This can be ignored if middleware refreshes user sessions.
          }
        },
      },
    }
  );

  // Runtime queries target the `vision` schema (db.schema above); cast back to the
  // default client type so the app's schema-agnostic helper signatures keep
  // accepting it. Queries are untyped (`any`) either way.
  return client as unknown as SupabaseClient;
}
