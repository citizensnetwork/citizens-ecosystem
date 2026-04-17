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
import type { Event, Place } from "@/types/db";
import { rankResults, type RankedResult } from "@/lib/aiSearch";

/** Upper bound on how many events/places we rank per request. */
const MAX_CANDIDATES = 500;

/** Upper bound on how many ranked results we return. */
const MAX_RESULTS = 100;

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

  const userLat = parseCoord(body.userLat);
  const userLng = parseCoord(body.userLng);
  const userLocation =
    userLat != null && userLng != null ? { lat: userLat, lng: userLng } : null;

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [eventsRes, placesRes] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .eq("visibility", "public")
      .gte("date", nowIso)
      .order("date", { ascending: true })
      .limit(MAX_CANDIDATES),
    supabase
      .from("places")
      .select("*, categories(*)")
      .limit(MAX_CANDIDATES),
  ]);

  const events = (eventsRes.data ?? []) as unknown as Event[];
  const places = (placesRes.data ?? []) as unknown as Place[];

  const { intent, events: rankedEvents, places: rankedPlaces } = rankResults(
    query,
    events,
    places,
    userLocation,
  );

  const cap = (arr: RankedResult[]) => arr.slice(0, MAX_RESULTS);

  return NextResponse.json({
    intent: {
      audience: [...intent.audience],
      needs: [...intent.needs],
      vibe: [...intent.vibe],
      nearMe: intent.nearMe,
      hasSignal: intent.hasSignal,
    },
    events: cap(rankedEvents),
    places: cap(rankedPlaces),
  });
}
