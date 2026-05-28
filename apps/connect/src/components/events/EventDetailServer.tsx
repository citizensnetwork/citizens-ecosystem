// Server component that fetches and renders the full event detail
// body (without any page chrome). Used by both the standalone
// `/events/[id]` page and the intercepted `@panel/(.)events/[id]`
// drawer so the two stay in sync with zero duplication.
//
// `cache()` wraps the top-level fetch so if Next.js renders both
// the `children` and `@panel` slots in the same request, we share
// one DB round-trip instead of two.

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import EventDetailContent from "@/components/events/EventDetailContent";
import { isAdmin as profileIsAdmin } from "@/lib/profiles/capabilities";
import type { Event, EventMedia, EventTag, UserRole } from "@/types/db";
import type { OrgBroadcast } from "@/components/contributor/OrgBroadcastList";

/**
 * Slim organiser summary shown on the event detail page (click to open
 * the organiser's public profile / contributor page). Kept tiny so the
 * payload stays small — the full profile is fetched lazily on nav.
 */
export type EventOrganiser = {
  id: string;
  full_name: string;
  role: UserRole;
  contributor_status: string | null;
  contributor_slug: string | null;
  logo_url: string | null;
  avatar_url: string | null;
};

export const getEventById = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .maybeSingle<Event>();
  return data;
});

export default async function EventDetailServer({ id }: { id: string }) {
  const supabase = await createClient();

  const event = await getEventById(id);

  if (!event) {
    notFound();
  }

  const [{ data: { user } }, { count }, { data: mediaRows }, { data: tagRows }, { data: organiserRow }, { data: broadcastRows }] = await Promise.all([
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
    supabase
      .from("event_tag_assignments")
      .select("tag:event_tags(id, slug, label, is_official, is_hidden, usage_count, created_by, created_at)")
      .eq("event_id", id),
    supabase
      .from("profiles")
      .select("id, full_name, role, contributor_status, contributor_slug, logo_url, avatar_url")
      .eq("id", event.created_by)
      .maybeSingle(),
    supabase
      .from("broadcast_messages")
      .select("id, body, created_at")
      .eq("entity_type", "event")
      .eq("entity_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const organiser: EventOrganiser | null = organiserRow
    ? {
        id: organiserRow.id as string,
        full_name: (organiserRow.full_name as string) ?? "",
        role: (organiserRow.role as UserRole) ?? "citizen",
        contributor_status:
          (organiserRow.contributor_status as string | null) ?? null,
        contributor_slug:
          (organiserRow.contributor_slug as string | null) ?? null,
        logo_url: (organiserRow.logo_url as string | null) ?? null,
        avatar_url: (organiserRow.avatar_url as string | null) ?? null,
      }
    : null;

  const media = (mediaRows ?? []) as EventMedia[];
  const tagRowsTyped = (tagRows ?? []) as unknown as Array<{
    tag: EventTag | EventTag[] | null;
  }>;
  const tags = tagRowsTyped
    .map((r) => (Array.isArray(r.tag) ? r.tag[0] : r.tag))
    .filter((t): t is EventTag => t !== null && t !== undefined && !t.is_hidden);

  const broadcasts = (broadcastRows ?? []) as OrgBroadcast[];

  let hasRsvped = false;
  let attendees: { user_id: string; full_name: string; isFriend: boolean }[] = [];
  let discoverableAttendees: { user_id: string; full_name: string; avatar_url: string | null }[] = [];
  let locationSharingEnabled = false;
  let isAdmin = false;
  let volunteerStatus: "none" | "pending" | "approved" | "declined" | "withdrawn" = "none";
  let volunteerApplicationId: string | null = null;

  // `rsvps.user_id` is a belongs-to FK to `profiles`, so Supabase
  // returns a single embedded object (or null), not an array.
  type RsvpRow = {
    user_id: string;
    profiles: { full_name: string | null } | null;
  };

  if (user) {
    const [{ data: rsvp }, { data: rsvpRows }, { data: myFollowing }, { data: profile }] =
      await Promise.all([
        supabase
          .from("rsvps")
          .select("id")
          .eq("user_id", user.id)
          .eq("event_id", id)
          .maybeSingle(),
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
          .select("location_sharing, role")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

    hasRsvped = !!rsvp;
    locationSharingEnabled = profile?.location_sharing ?? false;
    isAdmin = profileIsAdmin(profile);

    // Fetch the current user's volunteer application status for this event
    // (only when the event has volunteer_openings enabled).
    if (event.volunteer_openings) {
      const { data: va } = await supabase
        .from("volunteer_applications")
        .select("id, status")
        .eq("applicant_id", user.id)
        .eq("entity_type", "event")
        .eq("entity_id", id)
        .maybeSingle();
      if (va) {
        volunteerStatus = (va.status as typeof volunteerStatus) ?? "none";
        volunteerApplicationId = va.id as string;
      }
    }

    // Fetch discoverable attendees (only when viewer has RSVPed to the event)
    if (hasRsvped) {
      type DiscoverableRow = {
        user_id: string;
        profiles: { full_name: string | null; avatar_url: string | null } | null;
      };
      const { data: discoverableRows } = await supabase
        .from("rsvps")
        .select("user_id, profiles:user_id(full_name, avatar_url, discoverable)")
        .eq("event_id", id)
        .neq("user_id", user.id)
        .neq("user_id", event.created_by)
        .limit(20);

      discoverableAttendees = ((discoverableRows as unknown as (DiscoverableRow & {
        profiles: { full_name: string | null; avatar_url: string | null; discoverable: boolean } | null;
      })[]) ?? [])
        .filter((r) => r.profiles?.discoverable === true)
        .map((r) => ({
          user_id: r.user_id,
          full_name: r.profiles?.full_name ?? "Attendee",
          avatar_url: r.profiles?.avatar_url ?? null,
        }));
    }

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

    attendees = ((rsvpRows as RsvpRow[] | null) ?? []).map((r) => ({
      user_id: r.user_id,
      full_name: r.profiles?.full_name ?? "Anonymous",
      isFriend: friendSet.has(r.user_id),
    }));
  } else {
    const { data: rsvpRows } = await supabase
      .from("rsvps")
      .select("user_id, profiles(full_name)")
      .eq("event_id", id);

    attendees = ((rsvpRows as RsvpRow[] | null) ?? []).map((r) => ({
      user_id: r.user_id,
      full_name: r.profiles?.full_name ?? "Anonymous",
      isFriend: false,
    }));
  }

  return (
    <EventDetailContent
      event={event}
      count={count ?? 0}
      user={user}
      hasRsvped={hasRsvped}
      attendees={attendees}
      discoverableAttendees={discoverableAttendees}
      locationSharingEnabled={locationSharingEnabled}
      media={media}
      tags={tags}
      organiser={organiser}
      isAdmin={isAdmin}
      broadcasts={broadcasts}
      volunteerStatus={volunteerStatus}
      volunteerApplicationId={volunteerApplicationId}
      organiserHandle={organiser?.contributor_slug ?? null}
    />
  );
}
