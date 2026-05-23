import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`manage-places:${user.id}`, RATE_LIMITS.read);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Get user's created places with stats
  const { data: places } = await supabase
    .from("places")
    .select("id, name, address, verified, created_at")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (!places || places.length === 0) {
    return NextResponse.json({ places: [] });
  }

  const placeIds = places.map((p) => p.id);

  const [
    { data: follows },
    { data: reviews },
  ] = await Promise.all([
    supabase
      .from("place_follows")
      .select("place_id")
      .in("place_id", placeIds),
    supabase
      .from("reviews")
      .select("place_id, rating")
      .in("place_id", placeIds),
  ]);

  const enriched = places.map((place) => {
    const placeFollows = (follows ?? []).filter((f) => f.place_id === place.id);
    const placeReviews = (reviews ?? []).filter((r) => r.place_id === place.id);
    const avgRating = placeReviews.length > 0
      ? placeReviews.reduce((acc, r) => acc + r.rating, 0) / placeReviews.length
      : null;

    return {
      ...place,
      follow_count: placeFollows.length,
      review_count: placeReviews.length,
      avg_rating: avgRating,
    };
  });

  return NextResponse.json({ places: enriched });
}
