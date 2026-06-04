// Server component that fetches and renders the full place detail
// body (without any page chrome). Used by both the standalone
// `/places/[id]` page and the intercepted `@panel/(.)places/[id]`
// drawer so the two stay in sync with zero duplication.
//
// `cache()` wraps the top-level fetch so if Next.js renders both
// the `children` and `@panel` slots in the same request, we share
// one DB round-trip instead of two.

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PlaceDetailContent from "@/components/places/PlaceDetailContent";
import { isAdmin as profileIsAdmin, isApprovedContributor } from "@/lib/profiles/capabilities";
import type { Event, Place, PlaceMedia, Review } from "@/types/db";
import type { VolunteerStatus } from "@/components/volunteer/VolunteerApplyButton";

export const getPlaceById = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("places")
    .select("*, categories(*)")
    .eq("id", id)
    .maybeSingle<Place>();
  return data;
});

export default async function PlaceDetailServer({ id }: { id: string }) {
  const supabase = await createClient();

  const place = await getPlaceById(id);

  if (!place) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isOwner = !!user && user.id === place.created_by;

  const [reviewsRes, mediaRes, followerCountRes, userFollowRes, profileRes, ownerRes, upcomingEventsRes, pastEventsRes, broadcastsRes, volunteerAppRes] = await Promise.all([
    supabase
      .from("reviews")
      .select("*, profiles(full_name)")
      .eq("place_id", id)
      .order("created_at", { ascending: false })
      .returns<Review[]>(),
    supabase
      .from("place_media")
      .select("*")
      .eq("place_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .returns<PlaceMedia[]>(),
    supabase
      .from("place_follows")
      .select("id", { count: "exact", head: true })
      .eq("place_id", id),
    user
      ? supabase
          .from("place_follows")
          .select("id")
          .eq("place_id", id)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    place.created_by
      ? supabase
          .from("profiles")
          .select("id, full_name, role, contributor_status, contributor_slug")
          .eq("id", place.created_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    place.created_by
      ? supabase
          .from("events")
          .select("id, title, date, category, image_url")
          .eq("created_by", place.created_by)
          .eq("status", "active")
          .gte("date", new Date().toISOString())
          .order("date", { ascending: true })
          .limit(10)
          .returns<Pick<Event, "id" | "title" | "date" | "category" | "image_url">[]>()
      : Promise.resolve({ data: [] as Pick<Event, "id" | "title" | "date" | "category" | "image_url">[] }),
    place.created_by
      ? supabase
          .from("events")
          .select("id, title, date, category, image_url")
          .eq("created_by", place.created_by)
          .eq("status", "active")
          .lt("date", new Date().toISOString())
          .order("date", { ascending: false })
          .limit(10)
          .returns<Pick<Event, "id" | "title" | "date" | "category" | "image_url">[]>()
      : Promise.resolve({ data: [] as Pick<Event, "id" | "title" | "date" | "category" | "image_url">[] }),
    supabase
      .from("broadcast_messages")
      .select("id, body, created_at")
      .eq("entity_type", "place")
      .eq("entity_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(3),
    // Citizen's own volunteer application for this place (only when volunteer_openings is on)
    user && place.volunteer_openings
      ? supabase
          .from("volunteer_applications")
          .select("id, status")
          .eq("applicant_id", user.id)
          .eq("entity_type", "place")
          .eq("entity_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const reviews = reviewsRes.data;
  const media = mediaRes.data ?? [];
  const followerCount = followerCountRes.count ?? 0;
  const isFollowing = !!userFollowRes.data;
  const isAdmin = profileIsAdmin(profileRes.data);
  const canEdit = isOwner || isAdmin;
  const upcomingEvents = upcomingEventsRes.data ?? [];
  const pastEvents = pastEventsRes.data ?? [];
  const broadcasts = (broadcastsRes.data ?? []) as { id: string; body: string; created_at: string }[];

  const volunteerApp = volunteerAppRes.data as { id: string; status: string } | null;
  const volunteerStatus = (volunteerApp?.status ?? "none") as VolunteerStatus;

  const owner = (ownerRes.data ?? null) as {
    id: string;
    full_name: string | null;
    role: string | null;
    contributor_status: string | null;
    contributor_slug: string | null;
  } | null;
  const ownerLinkable =
    isApprovedContributor(owner) &&
    !!owner?.contributor_slug;

  const avgRating =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  return (
    <PlaceDetailContent
      place={place}
      owner={owner}
      ownerLinkable={ownerLinkable}
      media={media}
      followerCount={followerCount}
      isFollowing={isFollowing}
      avgRating={avgRating}
      reviewsCount={reviews?.length ?? 0}
      upcomingEvents={upcomingEvents}
      pastEvents={pastEvents}
      broadcasts={broadcasts}
      volunteerStatus={volunteerStatus}
      volunteerApplicationId={volunteerApp?.id ?? null}
      userId={user?.id ?? null}
      isAuthenticated={!!user}
      isOwner={isOwner}
      canEdit={canEdit}
    />
  );
}
