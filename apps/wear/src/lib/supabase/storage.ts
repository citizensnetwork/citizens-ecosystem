import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from './env';
import { createServerSupabaseClient } from './server';
import { bearerToken } from '@/lib/api/route-context';

/**
 * Request-scoped Supabase client for **Storage** operations, authenticated as the
 * caller — a `Bearer` access token (the cross-origin HTML app's localStorage
 * session) or the auth cookies, in that order. Returns `null` when Supabase env
 * is absent (dev / test / preview), so callers degrade gracefully.
 *
 * Uses the DEFAULT Postgres schema on purpose: Storage is schema-agnostic and the
 * `wear`-bound client (`createWearServerClient`) exists only for `wear.*` table
 * queries. Because the client carries the user's identity, `createSignedUploadUrl`
 * is authorised by the `storage.objects` INSERT policy scoped to the user's own
 * `{auth.uid()}/…` folder (migration 158) — so no service_role key is needed in
 * the Wear deployment (SHARED_DB_CONTRACT R3: RLS is the only isolation wall).
 */
export async function getRequestStorageClient(req: Request): Promise<SupabaseClient | null> {
  const env = getSupabaseEnv();
  if (!env) return null;

  const token = bearerToken(req);
  if (token) {
    return createClient(env.url, env.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  // Same-origin: the SSR server client already carries the auth cookies.
  return (await createServerSupabaseClient()) as unknown as SupabaseClient;
}
