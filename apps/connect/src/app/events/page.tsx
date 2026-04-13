import { createClient } from "@/lib/supabase/server";
import EventsView from "@/components/events/EventsView";
import OnboardingOverlay from "@/components/onboarding/OnboardingOverlay";
import type { Event, Place, Review } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const supabase = await createClient();

  // Limit events to upcoming 6 months to avoid loading the full history
  const now = new Date().toISOString();
  const sixMonths = new Date();
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  const cutoff = sixMonths.toISOString();

  const [{ data: events }, { data: places }, { data: reviews }] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .gte("date", now)
      .lte("date", cutoff)
      .order("date", { ascending: true })
      .returns<Event[]>(),
    supabase
      .from("places")
      .select("*, categories(*)")
      .order("name")
      .returns<Place[]>(),
    supabase
      .from("reviews")
      .select("place_id, rating, still_exists")
      .not("place_id", "is", null)
      .returns<Pick<Review, "place_id" | "rating" | "still_exists">[]>(),
  ]);

  const reviewBuckets = new Map<
    string,
    { total: number; count: number; negativeSignals: number }
  >();

  for (const review of reviews ?? []) {
    const placeId = review.place_id;
    if (!placeId) continue;

    const current = reviewBuckets.get(placeId) ?? {
      total: 0,
      count: 0,
      negativeSignals: 0,
    };

    current.total += review.rating;
    current.count += 1;
    if (review.still_exists === false) {
      current.negativeSignals += 1;
    }

    reviewBuckets.set(placeId, current);
  }

  const placesWithStats: Place[] = (places ?? []).map((place) => {
    const stats = reviewBuckets.get(place.id);
    const reviewsCount = stats?.count ?? 0;
    const avgRating = reviewsCount > 0 ? stats!.total / reviewsCount : null;
    const negativeSignals = stats?.negativeSignals ?? 0;
    const verificationFlagged =
      place.verification_flagged || negativeSignals >= 3 || place.verified === false;

    return {
      ...place,
      avg_rating: avgRating,
      reviews_count: reviewsCount,
      negative_signals: negativeSignals,
      verification_flagged: verificationFlagged,
    };
  });

  // Check if current user is a vendor
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let canCreateEvents = false;
  let showOnboarding = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, onboarding_completed")
      .eq("id", user.id)
      .single();
    // All authenticated users can create events (open creation)
    canCreateEvents = !!profile;
    showOnboarding = profile?.onboarding_completed === false;
  }

  return (
    <>
      {showOnboarding && <OnboardingOverlay show />}
      <EventsView
        events={events ?? []}
        places={placesWithStats}
        isVendor={canCreateEvents}
      />
    </>
  );
}
