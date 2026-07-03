/**
 * POST /api/ai-search
 * ----------------------------------------------------------------
 * Body: { query: string; userLat?: number; userLng?: number }
 *
 * Ranks upcoming public events and all places against the query using the
 * deterministic tag + text scoring engine in `@/lib/aiSearch`. Returns the
 * parsed intent (for "Why this matched" chips) plus the top-ranked IDs.
 *
 * Deliberately stateless and read-only — safe to call on every keystroke
 * from the client with a small debounce. Does not require authentication.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Event, Place, Profile } from "@/types/db";
import { rankResults, type RankedResult } from "@/lib/aiSearch";
import { checkRateLimit } from "@/lib/rate-limit";

/** Upper bound on how many events/places we rank per request. */
const MAX_CANDIDATES = 500;

/** Upper bound on how many ranked results we return. */
const MAX_RESULTS = 100;

/** Abuse guard for this public, unauthenticated endpoint. Each POST fans out
 *  to two DB queries returning up to 500 rows each, so we cap callers well
 *  below what a keystroke-driven client can produce with a 200ms debounce
 *  (~5 req/s) while staying generous enough for normal typing bursts. */
const AI_SEARCH_LIMIT = { limit: 30, windowMs: 60_000 } as const;

export const runtime = "nodejs";
// Per-user proximity boosts + live event data => always dynamic.
export const dynamic = "force-dynamic";

type Body = {
  query?: unknown;
  userLat?: unknown;
  userLng?: unknown;
};

function parseCoord(v: unknown): number | undefined {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/** Best-effort client IP for rate-limit keying on an unauthenticated
 *  endpoint. Falls back to a constant bucket so a misconfigured proxy can't
 *  silently disable the limiter entirely. */
function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json(
      { intent: null, events: [], places: [] },
      { status: 200 },
    );
  }
  if (query.length > 500) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 });
  }

  // Rate-limit by IP first (cheapest key; applies to anonymous callers).
  const ip = getClientIp(request);
  const ipRl = await checkRateLimit(`ai-search:ip:${ip}`, AI_SEARCH_LIMIT);
  if (!ipRl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(ipRl.resetMs / 1000).toString(),
        },
      },
    );
  }

  const userLat = parseCoord(body.userLat);
  const userLng = parseCoord(body.userLng);
  const userLocation =
    userLat != null && userLng != null ? { lat: userLat, lng: userLng } : null;

  const supabase = await createClient();
  // Resolve the user up-front so we can both (a) snapshot their preferences
  // for the rolling log and (b) decide whether to log at all (anonymous
  // visitors don't get logged — RLS would reject the insert anyway).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Second layer of rate-limiting keyed on user id when available — defeats
  // attackers who rotate IPs but share a single stolen session cookie.
  if (user) {
    const userRl = await checkRateLimit(`ai-search:user:${user.id}`, AI_SEARCH_LIMIT);
    if (!userRl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil(userRl.resetMs / 1000).toString(),
          },
        },
      );
    }
  }

  // Include events that started up to 2 hours ago so currently-running
  // events still surface in a "now" natural-language search.
  const windowStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const [eventsRes, placesRes, contributorsRes] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .eq("visibility", "public")
      .gte("date", windowStart)
      .order("date", { ascending: true })
      .limit(MAX_CANDIDATES),
    supabase
      .from("places")
      .select("*, categories(*)")
      .limit(MAX_CANDIDATES),
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "contributor")
      .eq("contributor_status", "approved")
      .limit(MAX_CANDIDATES),
  ]);

  const events = (eventsRes.data ?? []) as unknown as Event[];
  const places = (placesRes.data ?? []) as unknown as Place[];
  const contributors = (contributorsRes.data ?? []) as unknown as Profile[];

  const {
    intent,
    events: rankedEvents,
    places: rankedPlaces,
    contributors: rankedContributors,
  } = rankResults(query, events, places, userLocation, contributors);

  const limit = (arr: RankedResult[]) => arr.slice(0, MAX_RESULTS);

  const responseEvents = limit(rankedEvents);
  const responsePlaces = limit(rankedPlaces);
  const responseContributors = limit(rankedContributors);

  // Stage L: feed the anonymised global search-term table (top-10 +
  // autocomplete). Fires for EVERY search incl. anonymous — the RPC
  // sanitises server-side and stores no user id.
  //
  // Hardened in migration 118: log_search_term is REVOKEd from
  // anon/authenticated and GRANTed to service_role only, so we invoke it
  // through the admin client rather than the caller's client. This removes
  // the direct-RPC autocomplete-poisoning vector — /api/ai-search (already
  // rate-limited per-IP AND per-user above) is now the single throttled
  // write path. Fire-and-forget; never blocks or surfaces to the client.
  void (async () => {
    try {
      const admin = createAdminClient();
      const { error } = await admin.rpc("log_search_term", { p_term: query });
      if (error) console.error("[ai-search log_search_term]", error);
    } catch (err) {
      console.error("[ai-search log_search_term]", err);
    }
  })();

  // Fire-and-forget: log this search for signed-in users so we can power the
  // Rainbow "?" long-form sheet and downstream analytics. Non-blocking and
  // never surfaces errors to the client — search results take precedence.
  if (user) {
    void (async () => {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("preferences")
          .eq("id", user.id)
          .single();
        const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
        const snapshot = {
          percentages: prefs.percentages ?? null,
          tags: prefs.tags ?? null,
        };
        const resultIds: string[] = [];
        for (const r of responseEvents) resultIds.push(r.id);
        for (const r of responsePlaces) resultIds.push(r.id);
        for (const r of responseContributors) resultIds.push(r.id);
        await supabase.from("ai_search_queries").insert({
          user_id: user.id,
          query,
          intent: {
            audience: [...intent.audience],
            needs: [...intent.needs],
            vibe: [...intent.vibe],
            nearMe: intent.nearMe,
            hasSignal: intent.hasSignal,
          },
          result_ids: resultIds,
          preferences_snapshot: snapshot,
        });
      } catch (err) {
        console.error("[ai-search log]", err);
      }
    })();
  }

  return NextResponse.json({
    intent: {
      audience: [...intent.audience],
      needs: [...intent.needs],
      vibe: [...intent.vibe],
      nearMe: intent.nearMe,
      hasSignal: intent.hasSignal,
    },
    events: responseEvents,
    places: responsePlaces,
    contributors: responseContributors,
  });
}
