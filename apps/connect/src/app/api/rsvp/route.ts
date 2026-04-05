import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

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

  if (!eventId || typeof eventId !== "string") {
    return NextResponse.json(
      { error: "event_id is required" },
      { status: 400 }
    );
  }

  // Check the event exists
  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
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

  return NextResponse.json({ success: true }, { status: 201 });
}
