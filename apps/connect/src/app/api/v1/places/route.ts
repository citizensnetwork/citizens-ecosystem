/**
 * GET /api/v1/places
 * ----------------------------------------------------------------
 * Public, read-only directory of places (venues, churches, creative
 * spaces…) for Citizens ecosystem consumers and the map-first
 * frontend. The `places` RLS policy permits public SELECT on every row,
 * so the visibility rule has to live here: only `status = 'published'`
 * is served, exactly as /api/v1/events does.
 *
 * That filter was missing. Migration 167 gave a contributor a reversible
 * "cancel" for a place ("the app filters/badges them"), but this route
 * never selected `status`, let alone filtered on it — so a cancelled place
 * kept being published to the whole city, and the frontend had no way to
 * even know. (No live row is affected today: all 40 are published.)
 *
 * Query params (all optional):
 *   created_by  - UUID of the owning contributor (places.created_by)
 *   q           - case-insensitive substring match on name / description
 *   limit       - 1..100, default 50
 *   offset      - default 0
 *
 * Response envelope:
 *   { data: Place[], meta: { count, limit, offset } }
 *
 * Each row flattens its category into `category` (slug) +
 * `category_emoji` / `category_color`, so the map can colour pins
 * without a second round-trip.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateV1 } from "@/lib/v1Gate";
import { isValidUUID } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

function clampInt(raw: string | null, def: number, min: number, max: number) {
  if (!raw) return def;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export async function GET(request: Request) {
  const gate = await gateV1(request, { bucket: "v1-places" });
  if (gate.deny) return gate.deny;

  const url = new URL(request.url);
  const createdByRaw = url.searchParams.get("created_by");
  const createdBy = isValidUUID(createdByRaw) ? createdByRaw : null;
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const limit = clampInt(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 10_000);

  const supabase = await createClient();

  let query = supabase
    .from("places")
    .select(
      [
        "id",
        "name",
        "description",
        "address",
        "custom_category",
        "image_url",
        "phone",
        "website",
        // Places gained social columns in migration 172 — before it, the
        // create form collected handles and the insert dropped them.
        "instagram_url",
        "facebook_url",
        "tiktok_url",
        "youtube_url",
        "x_url",
        "linkedin_url",
        "whatsapp_url",
        "open_hours",
        "status",
        "latitude",
        "longitude",
        "created_by",
        "verified",
        "volunteer_openings",
        "created_at",
        // Embed the category so consumers get slug + pin styling without
        // a second request. category_id may be null (custom_category).
        "categories(slug,emoji,color)",
      ].join(","),
      { count: "exact" },
    )
    .eq("status", "published");

  if (createdBy) query = query.eq("created_by", createdBy);
  if (q) {
    // Allowlist letters/digits/space/hyphen/apostrophe — strips PostgREST
    // operator metacharacters so `or()` can't be steered (mirrors the
    // /api/v1/contributors hardening).
    const safe = q.replace(/[^a-zA-Z0-9 \-']/g, " ").trim();
    if (safe) {
      query = query.or(`name.ilike.%${safe}%,description.ilike.%${safe}%`);
    }
  }

  const { data, error, count } = await query
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[v1/places]", error);
    return NextResponse.json(
      { error: "Failed to list places" },
      { status: 500 },
    );
  }

  type CategoryEmbed = { slug: string; emoji: string; color: string } | null;
  type PlaceRow = {
    categories?: CategoryEmbed;
    [k: string]: unknown;
  };

  // Flatten the embedded category onto the row so the client shape stays
  // flat (category slug + pin styling), then drop the nested object.
  const rows = ((data ?? []) as unknown as PlaceRow[]).map((r) => {
    const cat = r.categories ?? null;
    const { categories: _drop, ...rest } = r;
    void _drop;
    return {
      ...rest,
      category: cat?.slug ?? null,
      category_emoji: cat?.emoji ?? null,
      category_color: cat?.color ?? null,
    };
  });

  return NextResponse.json(
    {
      data: rows,
      meta: {
        count: count ?? 0,
        limit,
        offset,
      },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
