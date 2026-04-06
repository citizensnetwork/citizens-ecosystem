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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const eventId = body.event_id;

  if (!isValidUUID(eventId)) {
    return NextResponse.json(
      { error: "Invalid ID format" },
      { status: 400 }
    );
  }

  // Atomic RSVP with capacity check (prevents race condition)
  const { data: result, error: rpcError } = await supabase.rpc("safe_rsvp", {
    p_user_id: user.id,
    p_event_id: eventId,
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const res = result as { success: boolean; error?: string; remaining?: number; status: number };

  if (!res.success) {
    return NextResponse.json(
      { error: res.error, remaining: res.remaining },
      { status: res.status }
    );
  }

  return NextResponse.json(
    { success: true, remaining: res.remaining },
    { status: 201 }
  );
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
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
