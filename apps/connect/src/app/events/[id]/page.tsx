import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import EventDetailContent from "@/components/events/EventDetailContent";
import type { Event } from "@/types/db";

export const dynamic = "force-dynamic";

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

  // Check if current user has RSVPed
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hasRsvped = false;
  if (user) {
    const { data: rsvp } = await supabase
      .from("rsvps")
      .select("id")
      .eq("user_id", user.id)
      .eq("event_id", id)
      .single();
    hasRsvped = !!rsvp;
  }

  // Get RSVP count
  const { count } = await supabase
    .from("rsvps")
    .select("*", { count: "exact", head: true })
    .eq("event_id", id);

  return (
    <EventDetailContent
      event={event}
      count={count ?? 0}
      user={user}
      hasRsvped={hasRsvped}
    />
  );
}
