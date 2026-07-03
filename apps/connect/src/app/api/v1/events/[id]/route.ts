/**
 * GET /api/v1/events/[id]
 * ----------------------------------------------------------------
 * Full public view of a single event + aggregated stats.
 *
 * 404 when the event does not exist, is not published, or is private.
 * Stats are best-effort: failures on any aggregate default to null so
 * the main payload always ships.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateV1 } from "@/lib/v1Gate";
import { isValidUUID } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const gate = await gateV1(request, {
    bucket: "v1-event",
    resourceId: id,
  });
  if (gate.deny) return gate.deny;

  const supabase = await createClient();

  const { data: event, error } = await supabase
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
        // `contact_email` and `contact_phone` are intentionally omitted
        // from the public v1 surface to prevent PII harvesting by
        // scrapers. Viewers who open the event page in the app can see
        // the creator's profile and message them instead. (Architect
        // audit H1.)
        "max_attendees",
        "latitude",
        "longitude",
        "created_by",
        "created_at",
        "community_contributor",
      ].join(","),
    )
    .eq("id", id)
    .eq("status", "published")
    .eq("visibility", "public")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to fetch event" }, { status: 500 });
  }
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Aggregate stats — best effort.
  const [rsvpGoingRes, rsvpConsiderRes, viewsRes, reviewsRes] = await Promise.all([
    supabase
      .from("rsvps")
      .select("*", { count: "exact", head: true })
      .eq("event_id", id)
      .eq("status", "going"),
    supabase
      .from("rsvps")
      .select("*", { count: "exact", head: true })
      .eq("event_id", id)
      .eq("status", "considering"),
    supabase
      .from("event_views")
      .select("*", { count: "exact", head: true })
      .eq("event_id", id),
    supabase
      .from("reviews")
      .select("rating")
      .eq("subject_type", "event")
      .eq("subject_id", id),
  ]);

  let averageRating: number | null = null;
  let reviewCount = 0;
  if (!reviewsRes.error && reviewsRes.data) {
    const ratings = (reviewsRes.data as Array<{ rating: number | null }>)
      .map((r) => r.rating)
      .filter((n): n is number => typeof n === "number");
    if (ratings.length) {
      averageRating =
        Math.round(
          (ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10,
        ) / 10;
      reviewCount = ratings.length;
    }
  }

  const eventData = event as unknown as Record<string, unknown>;
  return NextResponse.json(
    {
      data: {
        ...eventData,
        stats: {
          going: rsvpGoingRes.count ?? 0,
          considering: rsvpConsiderRes.count ?? 0,
          views: viewsRes.count ?? 0,
          average_rating: averageRating,
          review_count: reviewCount,
        },
      },
      // `generated_at` intentionally moved to a response header so the
      // body is byte-stable and CDN caching actually dedupes. (Architect
      // audit M6.)
      meta: {},
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        "X-Generated-At": new Date().toISOString(),
      },
    },
  );
}
