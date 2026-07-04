/**
 * GET /api/search/autocomplete?q=<prefix>&limit=<n>
 * ----------------------------------------------------------------
 * Stage L (A66): prefix-matched search suggestions for the global
 * search bar. Merges contributor-added keywords with popular recent
 * search terms via the get_search_autocomplete SECURITY DEFINER RPC.
 *
 * Public + unauthenticated (suggestions are shown to all users).
 * Stateless and read-only — safe to call on every keystroke with a
 * small debounce. Rate-limited by IP (and user id when present).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generous read limit — autocomplete is keystroke-driven with debounce. */
const AUTOCOMPLETE_LIMIT = { limit: 60, windowMs: 60_000 } as const;

function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  // Empty / too-short prefixes return nothing (the RPC would anyway).
  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }
  if (q.length > 80) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 });
  }

  let limit = Number(searchParams.get("limit") ?? 8);
  if (!Number.isFinite(limit) || limit < 1) limit = 8;
  if (limit > 20) limit = 20;

  const ip = getClientIp(request);
  const ipRl = await checkRateLimit(`autocomplete:ip:${ip}`, AUTOCOMPLETE_LIMIT);
  if (!ipRl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": Math.ceil(ipRl.resetMs / 1000).toString() } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const userRl = await checkRateLimit(`autocomplete:user:${user.id}`, AUTOCOMPLETE_LIMIT);
    if (!userRl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }

  const { data, error } = await supabase.rpc("get_search_autocomplete", {
    p_prefix: q,
    p_limit: limit,
  });

  if (error) {
    console.error("[autocomplete]", error);
    return NextResponse.json({ suggestions: [] });
  }

  // Shape: [{ suggestion, source }]
  return NextResponse.json(
    { suggestions: data ?? [] },
    { headers: { "Cache-Control": "private, max-age=30" } },
  );
}
