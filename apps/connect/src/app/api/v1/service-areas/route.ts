/**
 * GET /api/v1/service-areas
 * ----------------------------------------------------------------
 * The area hierarchy (province > city/town > suburb), public and read-only. It is a commons: no Contributor data.
 * The globe and the area picker both load this once and resolve "the area in view" on the device, so the map never
 * sends raw coordinates to us (issue #259).
 *
 * Query params (all optional):
 *   parent  - uuid. Only the direct children of that area (how suburbs are loaded, one city at a time).
 *   level   - province | place | suburb. Only that level.
 *   Neither given: provinces and cities/towns (the small index; suburbs are opt-in through `parent` or `level`).
 *   limit   - 1..1000, default 500
 *   offset  - default 0
 *
 * Response: { data: ServiceArea[], meta: { count, limit, offset } }, ordered provinces first, then grouped by parent, then `sort`, then A to Z (the client builds the tree from parent_id).
 * Cached for an hour at the edge: the rows change only by migration.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateV1 } from "@/lib/v1Gate";
import { isValidUUID } from "@/lib/validation";
import { isServiceAreaLevel } from "@/lib/serviceAreas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 500;

function clampInt(raw: string | null, def: number, min: number, max: number) {
  if (!raw) return def;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export async function GET(request: Request) {
  const gate = await gateV1(request, { bucket: "v1-service-areas" });
  if (gate.deny) return gate.deny;

  const url = new URL(request.url);
  const parent = url.searchParams.get("parent");
  const level = url.searchParams.get("level");
  if (parent !== null && !isValidUUID(parent)) {
    return NextResponse.json({ error: "invalid_parent" }, { status: 400 });
  }
  if (level !== null && !isServiceAreaLevel(level)) {
    return NextResponse.json({ error: "invalid_level" }, { status: 400 });
  }
  const limit = clampInt(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 100_000);

  const supabase = await createClient();
  let query = supabase
    .from("service_areas")
    .select("id, parent_id, level, name, slug, centroid_lat, centroid_lng, bbox_south, bbox_west, bbox_north, bbox_east, sort", {
      count: "exact",
    });

  if (parent) query = query.eq("parent_id", parent.toLowerCase());
  if (level) query = query.eq("level", level);
  else if (!parent) query = query.in("level", ["province", "place"]);

  const { data, error, count } = await query
    .order("parent_id", { ascending: true, nullsFirst: true })
    .order("sort", { ascending: true })
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to list service areas" }, { status: 500 });
  }

  return NextResponse.json(
    { data: data ?? [], meta: { count: count ?? 0, limit, offset } },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
