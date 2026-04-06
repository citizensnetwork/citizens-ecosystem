import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const eventId = body.event_id;

  if (!isValidUUID(eventId)) {
    return NextResponse.json(
      { error: "Invalid ID format" },
      { status: 400 }
    );
  }

  // Check the event exists and is published
  const { data: event } = await supabase
    .from("events")
    .select("id, status, max_attendees")
    .eq("id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.status !== "published") {
    return NextResponse.json(
      { error: `Cannot RSVP to a ${event.status} event` },
      { status: 400 }
    );
  }

  // Check capacity if max_attendees is set
  let remaining: number | null = null;
  if (event.max_attendees != null) {
    const { count } = await supabase
      .from("rsvps")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId);

    const currentCount = count ?? 0;
    if (currentCount >= event.max_attendees) {
      return NextResponse.json(
        { error: "Event is full", remaining: 0 },
        { status: 409 }
      );
    }
    remaining = event.max_attendees - currentCount - 1; // -1 for this new RSVP
  }

  const { error } = await supabase.from("rsvps").insert({
    user_id: user.id,
    event_id: eventId,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Already RSVPed to this event" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, remaining }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const eventId = body.event_id;

  if (!isValidUUID(eventId)) {
    return NextResponse.json(
      { error: "Invalid ID format" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("rsvps")
    .delete()
    .eq("user_id", user.id)
    .eq("event_id", eventId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
