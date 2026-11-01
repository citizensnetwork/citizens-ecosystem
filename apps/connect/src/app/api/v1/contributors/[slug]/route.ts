/**
 * GET /api/v1/contributors/[slug]
 * ----------------------------------------------------------------
 * Full public view of a single approved Contributor by vanity slug.
 * Returns profile + upcoming events (created or co-hosted) + owned places + live notes + counts, shaped
 * for ecosystem consumers (Citizens Central) without forcing a
 * second round-trip.
 *
 * Response envelope:
 *   { data: { profile, upcoming_events, past_events, places, moments,
 *             counts: { followers, events_total, places_total } },
 *   `counts.followers` is a bucket: 0 below 100, otherwise rounded down to 100, 250, 500, 1000, ...
 *     meta: { generated_at } }
 *   404 when slug does not resolve to an approved contributor.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateV1 } from "@/lib/v1Gate";
import { acceptedCohostEventIds, createdByOrIn } from "@/lib/events/cohosts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cap the event/place fan-out so one malicious contributor with 10k
 *  rows can't cause a single call to return a huge payload. */
const EVENTS_CAP = 100;
const PLACES_CAP = 100;
/** The database allows at most 5 live notes per Contributor (trigger moments_cap). */
const MOMENTS_CAP = 5;

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await context.params;
  const slug = (rawSlug ?? "").trim().slice(0, 120);
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const gate = await gateV1(request, {
    bucket: "v1-contributor",
    resourceId: slug,
  });
  if (gate.deny) return gate.deny;

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      [
        "id",
        "full_name",
        "role",
        "contributor_kind",
        "category:contributor_category",
        "contributor_slug",
        "bio",
        "avatar_url",
        "logo_url",
        "website_url",
        "instagram_handle",
        "facebook_url",
        "tiktok_handle",
        "youtube_url",
        "x_handle",
        "linkedin_url",
        "whatsapp_number",
        "physical_address",
        "physical_latitude",
        "physical_longitude",
        "no_fixed_location:contributor_no_fixed_location",
        "open_to_collaborate",
        "gallery_urls",
        "cover_photo_urls",
        "contact_email:contributor_contact_email",
        "created_at",
      ].join(","),
    )
    .eq("contributor_slug", slug)
    .eq("role", "contributor")
    .eq("contributor_status", "approved")
    .eq("contributor_hidden", false)
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

  // P2-09: the events they created PLUS the ones they co-host (an accepted invitation), in the same lists.
  const hostFilter = createdByOrIn(profileRow.id, await acceptedCohostEventIds(supabase, profileRow.id));

  const [upcomingRes, pastRes, placesRes, followersRes, momentsRes] = await Promise.all([
    supabase
      .from("events")
      .select("id,title,date,end_time,location,category,image_url,visibility,status")
      .or(hostFilter)
      .eq("status", "published")
      .eq("visibility", "public")
      .gte("date", now)
      .order("date", { ascending: true })
      .limit(EVENTS_CAP),
    supabase
      .from("events")
      .select("id,title,date,end_time,location,category,image_url,visibility,status")
      .or(hostFilter)
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
    // S13: the public number is a bucket (0 under 100, otherwise rounded down) and comes from a function:
    // the `follows` table itself is readable only by the person who follows, never by the public key.
    supabase.rpc("follower_count_public", { p_followee: profileRow.id }),
    // P2-05 (migration 188): the notes (Moments) that are still live, newest first. The database refuses anyone else's
    // ended notes to the public key; the filter is also here so a signed-in author never sees their own ended one.
    supabase
      .from("moments")
      .select("id,body,image_url,created_at,expires_at")
      .eq("contributor_id", profileRow.id)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(MOMENTS_CAP),
  ]);

  return NextResponse.json(
    {
      data: {
        profile,
        upcoming_events: upcomingRes.data ?? [],
        past_events: pastRes.data ?? [],
        places: placesRes.data ?? [],
        // A failed read of the notes never fails the profile: it just has none to show.
        moments: momentsRes.error ? [] : (momentsRes.data ?? []),
        counts: {
          followers: Number(followersRes.data ?? 0) || 0,
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
