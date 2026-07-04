/**
 * Server-side helper for resolving `Authorization: Bearer <key>` or
 * `X-API-Key: <key>` headers on the public /api/v1/* surface.
 *
 * Flow:
 *   1. Extract raw key from either header.
 *   2. Call the `resolve_api_key` SECURITY DEFINER RPC which hashes
 *      the token and looks it up in `public.api_keys`.
 *   3. Return `{ owner_id, scopes, rate_limit_per_minute }` on success
 *      or `null` if no key / invalid / disabled.
 *
 * On any lookup error we return `null` and let the route fall back to
 * the unauthenticated code path (which has its own tighter rate limit).
 * We never expose the reason for failure to the client.
 */

import { createClient } from "@/lib/supabase/server";

export interface ApiKeyContext {
  id: string;
  owner_id: string;
  scopes: string[];
  rate_limit_per_minute: number | null;
  /** First 16 chars of the raw key — safe for logs. */
  raw_prefix: string;
}

/** Default per-minute cap for authenticated keys that didn't specify one. */
export const DEFAULT_API_KEY_LIMIT = 600;
/** Per-minute cap for anonymous v1 access (kept small on purpose). */
export const ANON_V1_LIMIT = 60;

function extractBearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1]!.trim();
  }
  const xkey = req.headers.get("x-api-key");
  if (xkey) return xkey.trim();
  return null;
}

/**
 * Try to resolve an API key from the request. Returns `null` when no
 * key was provided OR when the provided key is invalid/disabled.
 *
 * Callers should gate higher rate-limit tiers on a non-null return and
 * continue to enforce a tighter IP-based limit when null.
 */
export async function resolveApiKey(
  req: Request,
): Promise<ApiKeyContext | null> {
  const raw = extractBearer(req);
  // Only recognise tokens that look like one of ours; anything else is
  // most likely a Supabase user JWT that happened to land in the
  // Authorization header (those are handled separately by createClient
  // reading cookies), and we don't want to RPC-lookup millions of
  // random-looking strings.
  if (!raw || !raw.startsWith("cck_")) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("resolve_api_key", {
      p_raw_key: raw,
    });
    if (error || !data) return null;
    const row = data as {
      id: string;
      owner_id: string;
      scopes: string[];
      rate_limit_per_minute: number | null;
    };
    return {
      id: row.id,
      owner_id: row.owner_id,
      scopes: row.scopes ?? [],
      rate_limit_per_minute: row.rate_limit_per_minute,
      raw_prefix: raw.slice(0, 16),
    };
  } catch (e) {
    // Log but don't leak — a DB/network blip shouldn't unlock the API
    // either, so we return null and the caller falls through to the
    // anonymous IP-limited path.
    console.error("[api-key resolve]", e);
    return null;
  }
}

/** True when the caller's scopes include the required scope. */
export function hasScope(ctx: ApiKeyContext, required: string): boolean {
  return ctx.scopes.includes(required);
}
