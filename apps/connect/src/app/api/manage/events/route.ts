import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's created events with stats
  const { data: events } = await supabase
    .from("events")
    .select("id, title, date, end_time, status, visibility, category, max_attendees")
    .eq("created_by", user.id)
    .order("date", { ascending: false });

  if (!events || events.length === 0) {
    return NextResponse.json({ events: [] });
  }

  const eventIds = events.map((e) => e.id);

  // Fetch all stats in parallel
  const [
    { data: rsvps },
    { data: considers },
    { data: views },
  ] = await Promise.all([
    supabase
      .from("rsvps")
      .select("event_id, status, created_at, profiles(full_name)")
      .in("event_id", eventIds),
    supabase
      .from("rsvps")
      .select("event_id")
      .in("event_id", eventIds)
      .eq("status", "considering"),
    supabase
      .from("event_views")
      .select("event_id")
      .in("event_id", eventIds),
  ]);

  const enriched = events.map((event) => {
    const eventRsvps = (rsvps ?? []).filter((r) => r.event_id === event.id);
    const attendees = eventRsvps.filter((r) => r.status === "attending");
    const considering = (considers ?? []).filter((c) => c.event_id === event.id);
    const eventViews = (views ?? []).filter((v) => v.event_id === event.id);

    return {
      ...event,
      attendee_count: attendees.length,
      consider_count: considering.length,
      view_count: eventViews.length,
      attendees: attendees.map((a) => ({
        full_name: ((a as Record<string, unknown>).profiles as { full_name: string } | null)?.full_name ?? "Anonymous",
        created_at: a.created_at,
      })),
    };
  });

  return NextResponse.json({ events: enriched });
}
