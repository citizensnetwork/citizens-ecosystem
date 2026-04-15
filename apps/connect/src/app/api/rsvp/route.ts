import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`rsvp:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
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
    console.error("[API rsvp POST]", rpcError);
    return NextResponse.json({ error: "Failed to RSVP" }, { status: 500 });
  }

  const res = result as { success: boolean; error?: string; remaining?: number; status: number };

  if (!res.success) {
    return NextResponse.json(
      { error: res.error, remaining: res.remaining },
      { status: res.status }
    );
  }

  // Check if user has set up interests (progressive profiling hint)
  const { count } = await supabase
    .from("user_interests")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  return NextResponse.json(
    { success: true, remaining: res.remaining, needsProfileSetup: count === 0 },
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

  const rl = checkRateLimit(`rsvp:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
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
    console.error("[API rsvp DELETE]", error);
    return NextResponse.json({ error: "Failed to cancel RSVP" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
