/**
 * GET /api/v1/categories
 * ----------------------------------------------------------------
 * Lists event/place categories plus a denormalised `event_count` of
 * currently-published public events per slug. Ecosystem consumers
 * (Citizens Central, directory feeds) use this to drive topic pages.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateV1 } from "@/lib/v1Gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await gateV1(request, { bucket: "v1-categories" });
  if (gate.deny) return gate.deny;

  const url = new URL(request.url);
  const appliesToParam = url.searchParams.get("applies_to");
  const appliesTo =
    appliesToParam === "events" ||
    appliesToParam === "places" ||
    appliesToParam === "both"
      ? appliesToParam
      : null;

  const supabase = await createClient();

  let q = supabase
    .from("categories")
    .select("id, name, slug, emoji, color, applies_to, sort_order")
    .order("sort_order", { ascending: true })
    // Hard cap to prevent the N+1 count fan-out from amplifying under
    // anon load (Architect audit M5).
    .limit(30);
  if (appliesTo) {
    // "events" → rows applying to events OR both
    const include =
      appliesTo === "events"
        ? ["events", "both"]
        : appliesTo === "places"
          ? ["places", "both"]
          : ["both"];
    q = q.in("applies_to", include);
  }

  const { data: categories, error } = await q;
  if (error) {
    return NextResponse.json(
      { error: "Failed to list categories" },
      { status: 500 },
    );
  }

  // Denormalise event counts. Single-round-trip count-by-category
  // using RPC would be ideal; here we issue N small head:true counts
  // with a hard cap on N (~20 categories) so it stays cheap and is
  // cached for 5 minutes downstream.
  const rows = categories ?? [];
  const counts = await Promise.all(
    rows.map(async (c) => {
      const { count } = await supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("status", "published")
        .eq("visibility", "public")
        .eq("category", c.slug);
      return count ?? 0;
    }),
  );

  const data = rows.map((c, i) => ({ ...c, event_count: counts[i] }));

  return NextResponse.json(
    { data, meta: { count: data.length } },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
