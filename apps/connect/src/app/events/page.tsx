import { createClient } from "@/lib/supabase/server";
import EventsView from "@/components/events/EventsView";
import EasterEggOrchestrator from "@/components/easter/EasterEggOrchestrator";
import type { Event, Place, Preferences, Profile, Review } from "@/types/db";

export const dynamic = "force-dynamic";

/** Cap public-bucket fetches so a mature platform with thousands of
 *  rows can't blow up first-paint payload. The map shell only needs a
 *  representative sample for search ranking + clustering. */
const PLACES_LIMIT = 1000;
const REVIEWS_LIMIT = 5000;
/** Only consider reviews from the last 12 months when computing
 *  freshness / verification signals. Older signals are noise. */
const REVIEW_WINDOW_MONTHS = 12;

export default async function EventsPage() {
  const supabase = await createClient();

  // Limit events to upcoming 6 months to avoid loading the full history
  const now = new Date().toISOString();
  const sixMonths = new Date();
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  const cutoff = sixMonths.toISOString();

  const reviewWindowStart = new Date();
  reviewWindowStart.setMonth(reviewWindowStart.getMonth() - REVIEW_WINDOW_MONTHS);
  const reviewWindowCutoff = reviewWindowStart.toISOString();

  // Resolve the current user first — it's a fast local cookie read and we
  // need user.id to fan out the preferences fetch alongside the public
  // data queries. Previously preferences ran sequentially after the
  // Promise.all block; this restructure removes that round-trip.
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const preferencesPromise = currentUser
    ? supabase
        .from("profiles")
        .select("preferences, created_at")
        .eq("id", currentUser.id)
        .maybeSingle()
    : Promise.resolve({ data: null as { preferences: unknown; created_at: string } | null });

  // Fetch public events, places, approved contributors (for search bucket),
  // reviews, and the current user's preferences in parallel.
  // Contributor list stays small (bounded at 200) since it only powers
  // client-side search ranking — never the map itself.
  const [
    { data: publicEvents },
    { data: places },
    { data: reviews },
    { data: contributors },
    { data: profile },
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
      .limit(PLACES_LIMIT)
      .returns<Place[]>(),
    supabase
      .from("reviews")
      .select("place_id, rating, still_exists")
      .not("place_id", "is", null)
      .gte("created_at", reviewWindowCutoff)
      .order("created_at", { ascending: false })
      .limit(REVIEWS_LIMIT)
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
    preferencesPromise,
  ]);


  // Filter: show public events to everyone; show private events only to creator or RSVPed users
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

  // Hydrate preferences (already fetched in the parallel block above)
  // for the Easter-egg orchestrator. Event-creation gating happens inside
  // child components — the legacy `isVendor` prop on EventsView was dead
  // code, so we no longer compute or pass it here.
  const userPreferences = currentUser
    ? ((profile?.preferences as Preferences | null) ?? null)
    : null;
  const accountCreatedAt = currentUser ? (profile?.created_at ?? "") : "";

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
      />
    </>
  );
}
