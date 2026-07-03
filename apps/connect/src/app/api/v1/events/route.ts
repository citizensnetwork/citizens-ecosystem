/**
 * GET /api/v1/events
 * ----------------------------------------------------------------
 * Public, read-only event feed for Citizens ecosystem consumers.
 *
 * Only `status = 'published'` AND `visibility = 'public'` events are
 * returned. Private/draft/cancelled events never leak through this
 * surface.
 *
 * Query params (all optional):
 *   category    - slug of category (e.g. "worship"); matches events.category
 *   from, to    - ISO-8601 start window (events.date >= from, <= to)
 *   lat, lng    - numeric, used with `radius_km` for proximity filter
 *   radius_km   - default 25, max 500 when lat/lng provided
 *   created_by  - UUID of contributor (events.created_by)
 *   limit       - 1..100, default 50
 *   offset      - default 0
 *
 * Response envelope:
 *   { data: Event[], meta: { count, limit, offset } }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateV1 } from "@/lib/v1Gate";
import { isValidUUID } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const MAX_RADIUS_KM = 500;
const DEFAULT_RADIUS_KM = 25;
const CATEGORY_RE = /^[a-z0-9\-]{1,40}$/;

function clampInt(raw: string | null, def: number, min: number, max: number) {
  if (!raw) return def;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function parseFloat01(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h =
    s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export async function GET(request: Request) {
  const gate = await gateV1(request, { bucket: "v1-events" });
  if (gate.deny) return gate.deny;

  const url = new URL(request.url);
  const categoryParam = (url.searchParams.get("category") ?? "").trim();
  const category = CATEGORY_RE.test(categoryParam) ? categoryParam : null;
  const from = parseIsoDate(url.searchParams.get("from"));
  const to = parseIsoDate(url.searchParams.get("to"));
  const lat = parseFloat01(url.searchParams.get("lat"));
  const lng = parseFloat01(url.searchParams.get("lng"));
  const radiusKm = clampInt(
    url.searchParams.get("radius_km"),
    DEFAULT_RADIUS_KM,
    1,
    MAX_RADIUS_KM,
  );
  const createdByRaw = url.searchParams.get("created_by");
  const createdBy =
    isValidUUID(createdByRaw) ? createdByRaw : null;
  const limit = clampInt(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  // Offset ceiling: drop to 500 when proximity filter is active because
  // the in-memory post-filter makes deep pagination semantically broken
  // and expensive (Architect audit M1).
  const maxOffset = 10_000;
  const offsetCap = 500;
  const offset = clampInt(
    url.searchParams.get("offset"),
    0,
    0,
    maxOffset,
  );

  const hasProximity =
    lat !== null &&
    lng !== null &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  // When proximity is active, clamp offset so an attacker can't trick
  // us into pre-fetching 10k+ rows to satisfy page 200.
  const effectiveOffset = hasProximity ? Math.min(offset, offsetCap) : offset;

  const supabase = await createClient();

  // Proximity pre-filter: if lat/lng are provided, expand limit so we
  // can post-filter by haversine without losing rows. This keeps the
  // implementation simple without requiring PostGIS. For production
  // scale a PostGIS geography column would be preferable.
  const preFetchLimit = hasProximity
    ? Math.min(MAX_LIMIT * 4, limit * 4 + effectiveOffset)
    : limit;
  const preFetchOffset = hasProximity ? 0 : effectiveOffset;

  let query = supabase
    .from("events")
    .select(
      [
        "id",
        "title",
        "description",
        "date",
        "end_time",
        "location",
        "category",
        "image_url",
        "website_url",
        "latitude",
        "longitude",
        "created_by",
        "created_at",
        "community_contributor",
        "volunteer_openings",
      ].join(","),
      // `count: 'exact'` dropped on the public listing to stop scanning
      // the full filtered set on every poll. Consumers use page advance
      // instead of jumping to arbitrary offsets. (Architect audit M1/M2.)
    )
    .eq("status", "published")
    .eq("visibility", "public");

  if (category) query = query.eq("category", category);
  if (from) query = query.gte("date", from);
  if (to) query = query.lte("date", to);
  if (createdBy) query = query.eq("created_by", createdBy);
  if (hasProximity) {
    query = query
      .not("latitude", "is", null)
      .not("longitude", "is", null);
  }

  const { data, error } = await query
    .order("date", { ascending: true })
    .range(preFetchOffset, preFetchOffset + preFetchLimit - 1);

  if (error) {
    console.error("[v1/events]", error);
    return NextResponse.json(
      { error: "Failed to list events" },
      { status: 500 },
    );
  }

  type EventRow = {
    latitude: number | null;
    longitude: number | null;
    [k: string]: unknown;
  };

  let rows: EventRow[] = (data ?? []) as unknown as EventRow[];
  let hasMore = rows.length === preFetchLimit;

  if (hasProximity) {
    const within = rows.filter(
      (r) =>
        r.latitude !== null &&
        r.longitude !== null &&
        haversineKm(lat!, lng!, r.latitude, r.longitude) <= radiusKm,
    );
    rows = within.slice(effectiveOffset, effectiveOffset + limit);
    hasMore = within.length > effectiveOffset + limit;
  }

  return NextResponse.json(
    {
      data: rows,
      // `count` intentionally omitted — see M1/M2. `has_more` is cheap
      // and sufficient for cursor-style pagination by consumers.
      meta: {
        limit,
        offset: effectiveOffset,
        has_more: hasMore,
        approximate: hasProximity,
      },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
