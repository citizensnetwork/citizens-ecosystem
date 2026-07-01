import { getRouteAuth } from "@/lib/supabase/route";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const { supabase, user } = await getRouteAuth(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`consider:${user.id}`, RATE_LIMITS.mutation);
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
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  const { data: result, error: rpcError } = await supabase.rpc("toggle_consider", {
    p_user_id: user.id,
    p_event_id: eventId,
  });

  if (rpcError) {
    console.error("[API consider POST]", rpcError);
    return NextResponse.json({ error: "Failed to toggle consider" }, { status: 500 });
  }

  return NextResponse.json(result);
}

/** Join a friend's consider — "+1" */
export async function PUT(request: NextRequest) {
  const { supabase, user } = await getRouteAuth(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`consider-join:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const rsvpId = body.rsvp_id;

  if (!isValidUUID(rsvpId)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  const { error } = await supabase
    .from("consider_joins")
    .upsert({ rsvp_id: rsvpId, joiner_id: user.id }, { onConflict: "rsvp_id,joiner_id" });

  if (error) {
    console.error("[API consider PUT]", error);
    return NextResponse.json({ error: "Failed to join consider" }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
