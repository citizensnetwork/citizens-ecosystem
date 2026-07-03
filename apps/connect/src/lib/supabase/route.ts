import { createServerClient } from "@supabase/ssr";
import { createClient } from "./server";

/**
 * Resolve the authenticated user for an API route handler, supporting BOTH
 * transport mechanisms the app uses:
 *
 *  1. **Bearer token** — the standalone HTML/Capacitor frontend is cross-origin
 *     and keeps its Supabase session in localStorage, so it sends no auth
 *     cookie. It must present `Authorization: Bearer <access_token>` instead.
 *     The token rides on every PostgREST/RPC call (via `global.headers`), so
 *     RLS evaluates as that user, and `getUser(token)` validates it against the
 *     auth server (a real network check, not a local JWT decode).
 *
 *  2. **Cookie session** — same-origin / server callers keep the existing
 *     `@supabase/ssr` cookie behaviour (delegated to `createClient()`).
 *
 * Returns the user-scoped Supabase client plus the resolved user (null when
 * unauthenticated — callers should return 401). This is the single place that
 * knows how a request proves its identity, so individual routes stay uniform.
 */
export async function getRouteAuth(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = /^bearer\s+/i.test(authHeader)
    ? authHeader.replace(/^bearer\s+/i, "").trim()
    : null;

  if (bearer) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key-for-prerender";

    // No-op cookie adapter: this path is stateless — no session is read from
    // or written to cookies. The user identity comes solely from the bearer
    // token set as the default Authorization header for all downstream calls.
    const supabase = createServerClient(url, key, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      cookies: { getAll: () => [], setAll: () => {} },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser(bearer);
    return { supabase, user };
  }

  // Cookie-based fallback — unchanged behaviour for same-origin callers.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}
