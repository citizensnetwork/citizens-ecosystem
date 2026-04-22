/**
 * GET /api/v1/contributors/[slug]
 * ----------------------------------------------------------------
 * Full public view of a single approved Contributor by vanity slug.
 * Returns profile + upcoming events + owned places + counts, shaped
 * for ecosystem consumers (Citizens Central) without forcing a
 * second round-trip.
 *
 * Response envelope:
 *   { data: { profile, upcoming_events, past_events, places,
 *             counts: { followers, events_total, places_total } },
 *     meta: { generated_at } }
 *   404 when slug does not resolve to an approved contributor.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RL = { limit: 60, windowMs: 60_000 } as const;
/** Cap the event/place fan-out so one malicious contributor with 10k
 *  rows can't cause a single call to return a huge payload. */
const EVENTS_CAP = 100;
const PLACES_CAP = 100;

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await context.params;
  const slug = (rawSlug ?? "").trim().slice(0, 120);
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const rl = checkRateLimit(`v1-contributor:ip:${ip}`, RL);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() },
      },
    );
  }

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      [
        "id",
        "full_name",
        "role",
        "contributor_kind",
        "contributor_slug",
        "bio",
        "avatar_url",
        "logo_url",
        "website_url",
        "instagram_handle",
        "facebook_url",
        "tiktok_handle",
        "youtube_url",
        "physical_address",
        "physical_latitude",
        "physical_longitude",
        "gallery_urls",
        "created_at",
      ].join(","),
    )
    .eq("contributor_slug", slug)
    .eq("role", "contributor")
    .eq("contributor_status", "approved")
    .maybeSingle();

  if (!profile) {
    return NextResponse.json(
      { error: "Contributor not found" },
      { status: 404 },
    );
  }

  // Narrow the supabase union return to the expected shape. We only
  // read `.id` immediately after; downstream fields are already
  // typed via the `select(...)` shape.
  const profileRow = profile as unknown as { id: string };

  const now = new Date().toISOString();

  const [upcomingRes, pastRes, placesRes, followersRes] = await Promise.all([
    supabase
      .from("events")
      .select("id,title,date,end_time,location,category,image_url,visibility,status")
      .eq("created_by", profileRow.id)
      .eq("status", "published")
      .eq("visibility", "public")
      .gte("date", now)
      .order("date", { ascending: true })
      .limit(EVENTS_CAP),
    supabase
      .from("events")
      .select("id,title,date,end_time,location,category,image_url,visibility,status")
      .eq("created_by", profileRow.id)
      .eq("status", "published")
      .eq("visibility", "public")
      .lt("date", now)
      .order("date", { ascending: false })
      .limit(EVENTS_CAP),
    supabase
      .from("places")
      .select(
        "id,name,description,address,latitude,longitude,category_id,image_url,website,phone",
      )
      .eq("created_by", profileRow.id)
      .order("name", { ascending: true })
      .limit(PLACES_CAP),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_id", profileRow.id),
  ]);

  return NextResponse.json(
    {
      data: {
        profile,
        upcoming_events: upcomingRes.data ?? [],
        past_events: pastRes.data ?? [],
        places: placesRes.data ?? [],
        counts: {
          followers: followersRes.count ?? 0,
          events_total:
            (upcomingRes.data?.length ?? 0) + (pastRes.data?.length ?? 0),
          places_total: placesRes.data?.length ?? 0,
        },
      },
      meta: { generated_at: new Date().toISOString() },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
