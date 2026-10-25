/**
 * GET /api/v1/serving?area=<uuid>
 * ----------------------------------------------------------------
 * The globe's list for ONE area in view (issue #259). Keyed by area id, never by raw coordinates: the device resolves
 * "the area in view" locally from /api/v1/service-areas and asks only when the resolved area changes.
 *
 *   main            approved, visible Contributors with no map pin ("online or no fixed place") who ticked this area or
 *                   an area containing it. Matching goes downward only: a viewer zoomed out to Gauteng does not match
 *                   someone who ticked only Eldoraigne. Grouped suburb, city/town, province, then A to Z.
 *   also_served_by  at most 5 whose radius reaches this area and who are not in `main`; nearest first, then A to Z.
 *
 * Nothing is ordered by popularity. The fields are an allow-list (name, slug, kind, category, avatar, logo): no contact
 * details, no coordinates. The database function runs as the caller (SECURITY INVOKER), so RLS and the approval wall
 * apply twice. Short edge cache: approvals and edits show within a minute or two.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateV1 } from "@/lib/v1Gate";
import { isValidUUID } from "@/lib/validation";
import { ALSO_SERVED_LIMIT, isServiceAreaLevel, shapeServing, type ListingRow } from "@/lib/serviceAreas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const area = new URL(request.url).searchParams.get("area") ?? "";
  if (!isValidUUID(area)) {
    return NextResponse.json({ error: "invalid_area" }, { status: 400 });
  }
  const areaId = area.toLowerCase();

  // the per-area cap stops a rotating-IP caller from hammering one area
  const gate = await gateV1(request, { bucket: "v1-serving", resourceId: areaId });
  if (gate.deny) return gate.deny;

  const supabase = await createClient();
  const [areaRes, listRes] = await Promise.all([
    supabase.from("service_areas").select("id, name, slug, level").eq("id", areaId).maybeSingle(),
    supabase.rpc("serving_area_listings", { p_area_id: areaId, p_also_limit: ALSO_SERVED_LIMIT }),
  ]);

  if (areaRes.error || listRes.error) {
    return NextResponse.json({ error: "Failed to load the serving list" }, { status: 500 });
  }
  const row = areaRes.data;
  if (!row || !isServiceAreaLevel(row.level)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = shapeServing(
    { id: row.id, name: row.name, slug: row.slug, level: row.level },
    (Array.isArray(listRes.data) ? listRes.data : []) as ListingRow[],
  );
  return NextResponse.json(
    { data: body },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
  );
}
