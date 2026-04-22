// Server component that fetches and renders the full event detail
// body (without any page chrome). Used by both the standalone
// `/events/[id]` page and the intercepted `@panel/(.)events/[id]`
// drawer so the two stay in sync with zero duplication.

import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import EventDetailContent from "@/components/events/EventDetailContent";
import type { Event, EventMedia } from "@/types/db";

export default async function EventDetailServer({ id }: { id: string }) {
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single<Event>();

  if (!event) {
    notFound();
  }

  const [{ data: { user } }, { count }, { data: mediaRows }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("rsvps")
      .select("*", { count: "exact", head: true })
      .eq("event_id", id),
    supabase
      .from("event_photos")
      .select("*")
      .eq("event_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const media = (mediaRows ?? []) as EventMedia[];

  let hasRsvped = false;
  let attendees: { user_id: string; full_name: string; isFriend: boolean }[] = [];
  let locationSharingEnabled = false;

  if (user) {
    const [{ data: rsvp }, { data: rsvpRows }, { data: myFollowing }, { data: profile }] =
      await Promise.all([
        supabase
          .from("rsvps")
          .select("id")
          .eq("user_id", user.id)
          .eq("event_id", id)
          .single(),
        supabase
          .from("rsvps")
          .select("user_id, profiles(full_name)")
          .eq("event_id", id),
        supabase
          .from("follows")
          .select("followee_id")
          .eq("follower_id", user.id),
        supabase
          .from("profiles")
          .select("location_sharing")
          .eq("id", user.id)
          .single(),
      ]);

    hasRsvped = !!rsvp;
    locationSharingEnabled = profile?.location_sharing ?? false;

    const followeeIds = (myFollowing ?? []).map((f) => f.followee_id);
    let friendSet = new Set<string>();
    if (followeeIds.length > 0) {
      const { data: theyFollowBack } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("followee_id", user.id)
        .in("follower_id", followeeIds);
      friendSet = new Set((theyFollowBack ?? []).map((f) => f.follower_id));
    }

    attendees = (rsvpRows ?? []).map(
      (r: { user_id: string; profiles: { full_name: string }[] }) => ({
        user_id: r.user_id,
        full_name: r.profiles?.[0]?.full_name ?? "Anonymous",
        isFriend: friendSet.has(r.user_id),
      }),
    );
  } else {
    const { data: rsvpRows } = await supabase
      .from("rsvps")
      .select("user_id, profiles(full_name)")
      .eq("event_id", id);

    attendees = (rsvpRows ?? []).map(
      (r: { user_id: string; profiles: { full_name: string }[] }) => ({
        user_id: r.user_id,
        full_name: r.profiles?.[0]?.full_name ?? "Anonymous",
        isFriend: false,
      }),
    );
  }

  return (
    <EventDetailContent
      event={event}
      count={count ?? 0}
      user={user}
      hasRsvped={hasRsvped}
      attendees={attendees}
      locationSharingEnabled={locationSharingEnabled}
      media={media}
    />
  );
}
