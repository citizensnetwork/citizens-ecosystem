import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import EventDetailContent from "@/components/events/EventDetailContent";
import type { Event, EventMedia } from "@/types/db";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("title, description, image_url, date, location")
    .eq("id", id)
    .single();

  if (!event) return { title: "Event Not Found" };

  const description =
    event.description.length > 150
      ? event.description.slice(0, 147) + "..."
      : event.description;

  const dateStr = new Date(event.date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    title: event.title,
    description,
    openGraph: {
      title: event.title,
      description: `${dateStr} · ${event.location}\n${description}`,
      type: "article",
      ...(event.image_url && { images: [{ url: event.image_url }] }),
    },
    twitter: {
      card: event.image_url ? "summary_large_image" : "summary",
      title: event.title,
      description,
      ...(event.image_url && { images: [event.image_url] }),
    },
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single<Event>();

  if (!event) {
    notFound();
  }

  // Fetch user, RSVP count, and media gallery in parallel
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
    // Fetch RSVP status, attendee list, user's follows, and profile in parallel
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

    // Build friend set (bidirectional follows)
    const followeeIds = (myFollowing ?? []).map((f) => f.followee_id);
    let friendSet = new Set<string>();
    if (followeeIds.length > 0) {
      const { data: theyFollowBack } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("followee_id", user.id)
        .in("follower_id", followeeIds);
      friendSet = new Set(
        (theyFollowBack ?? []).map((f) => f.follower_id)
      );
    }

    attendees = (rsvpRows ?? []).map(
      (r: { user_id: string; profiles: { full_name: string }[] }) => ({
        user_id: r.user_id,
        full_name: r.profiles?.[0]?.full_name ?? "Anonymous",
        isFriend: friendSet.has(r.user_id),
      })
    );
  } else {
    // Anonymous: just get names (no friend detection)
    const { data: rsvpRows } = await supabase
      .from("rsvps")
      .select("user_id, profiles(full_name)")
      .eq("event_id", id);

    attendees = (rsvpRows ?? []).map(
      (r: { user_id: string; profiles: { full_name: string }[] }) => ({
        user_id: r.user_id,
        full_name: r.profiles?.[0]?.full_name ?? "Anonymous",
        isFriend: false,
      })
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
