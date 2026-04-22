import { createClient } from "@/lib/supabase/server";
import EventsView from "@/components/events/EventsView";
import EasterEggOrchestrator from "@/components/easter/EasterEggOrchestrator";
import type { Event, Place, Preferences, Profile, Review } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const supabase = await createClient();

  // Limit events to upcoming 6 months to avoid loading the full history
  const now = new Date().toISOString();
  const sixMonths = new Date();
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  const cutoff = sixMonths.toISOString();

  // Fetch public events, user's private events (RSVPed or created), places,
  // approved contributors (for search bucket), and reviews in parallel.
  // Contributor list stays small (bounded at 200) since it only powers
  // client-side search ranking — never the map itself.
  const [
    { data: publicEvents },
    { data: places },
    { data: reviews },
    { data: contributors },
  ] = await Promise.all([
    supabase
      .from("events")
      .select("*, creator:profiles!events_created_by_fkey(avatar_url, role, contributor_status)")
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
    supabase
      .from("profiles")
      .select(
        "id, email, role, full_name, avatar_url, contributor_kind, contributor_status, contributor_slug, bio, website_url, physical_address, physical_latitude, physical_longitude, logo_url",
      )
      .eq("role", "contributor")
      .eq("contributor_status", "approved")
      .not("contributor_slug", "is", null)
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<Profile[]>(),
  ]);


  // Filter: show public events to everyone; show private events only to creator or RSVPed users
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  let events: Event[] = [];
  if (currentUser) {
    // Get event IDs the user has RSVPed to
    const { data: rsvpRows } = await supabase
      .from("rsvps")
      .select("event_id")
      .eq("user_id", currentUser.id);
    const rsvpedIds = new Set((rsvpRows ?? []).map((r) => r.event_id));

    events = (publicEvents ?? []).filter((e) => {
      if (e.visibility !== "private") return true;
      // Private: show if user created it or RSVPed
      return e.created_by === currentUser.id || rsvpedIds.has(e.id);
    });
  } else {
    // Not logged in: only public events
    events = (publicEvents ?? []).filter((e) => e.visibility !== "private");
  }

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

  // Check if current user can create events
  let canCreateEvents = false;
  let userPreferences: Preferences | null = null;
  let accountCreatedAt = "";
  if (currentUser) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, preferences, created_at")
      .eq("id", currentUser.id)
      .single();
    // All authenticated users can create events (open creation)
    canCreateEvents = !!profile;
    userPreferences = (profile?.preferences as Preferences | null) ?? null;
    accountCreatedAt = profile?.created_at ?? "";
  }

  return (
    <>
      {currentUser && (
        <EasterEggOrchestrator
          userId={currentUser.id}
          initialPreferences={userPreferences}
          accountCreatedAt={accountCreatedAt}
        />
      )}
      <EventsView
        events={events ?? []}
        places={placesWithStats}
        contributors={contributors ?? []}
        isVendor={canCreateEvents}
      />
    </>
  );
}
