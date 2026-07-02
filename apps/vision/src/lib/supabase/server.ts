import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { bearerTokenFrom } from "@/lib/auth/bearer";

export async function createClient() {
  // Cross-origin path (ecosystem Step 4c): the standalone HTML frontend holds
  // its session in localStorage and sends `Authorization: Bearer <token>` —
  // cookies never travel with its requests. When a Bearer token is present,
  // return a per-request client that (a) carries the token on every PostgREST
  // call so RLS runs as that user, and (b) resolves the 45 existing
  // `supabase.auth.getUser()` call sites against the token (a header-only
  // client has no stored session, so the no-arg call must be bound to it).
  // Same semantics as Wear's `route-context.ts` Bearer branch, delivered in
  // this one file so no route handler needed editing.
  const headerStore = await headers();
  const token = bearerTokenFrom(headerStore.get("authorization"));
  if (token) {
    const client = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        db: { schema: "vision" },
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );
    const getUserWithToken = client.auth.getUser.bind(client.auth);
    client.auth.getUser = ((jwt?: string) =>
      getUserWithToken(jwt ?? token)) as typeof client.auth.getUser;
    return client as unknown as SupabaseClient;
  }

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
