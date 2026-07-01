/**
 * FEAT-04 Convince API.
 *
 * POST  /api/convince  { event_id, to_user_id }
 *   → Insert a row in `convinces`. RLS enforces:
 *     • sender = auth.uid()
 *     • sender ≠ target
 *     • mutual follow exists in both directions
 *     • target currently has an rsvps row with status='considering'
 *   Duplicates collide with the permanent UNIQUE constraint and are
 *   surfaced as 409.
 *
 * DELETE /api/convince  { event_id, to_user_id }
 *   → Withdraw a convince previously sent. RLS limits delete to sender.
 */

import { getRouteAuth } from "@/lib/supabase/route";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

type ConvinceBody = {
  event_id?: unknown;
  to_user_id?: unknown;
};

async function parseAndValidate(
  request: NextRequest,
): Promise<{ eventId: string; toUserId: string } | NextResponse> {
  let body: ConvinceBody;
  try {
    body = (await request.json()) as ConvinceBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const eventId = typeof body.event_id === "string" ? body.event_id : "";
  const toUserId = typeof body.to_user_id === "string" ? body.to_user_id : "";

  if (!isValidUUID(eventId) || !isValidUUID(toUserId)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  return { eventId, toUserId };
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await getRouteAuth(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`convince:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = await parseAndValidate(request);
  if (parsed instanceof NextResponse) return parsed;

  if (parsed.toUserId === user.id) {
    return NextResponse.json({ error: "Cannot convince yourself" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("convinces")
    .insert({
      from_user_id: user.id,
      to_user_id: parsed.toUserId,
      event_id: parsed.eventId,
    })
    .select("id, created_at")
    .single();

  if (error) {
    // 23505 = unique_violation → already convinced this person for this event.
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already convinced", code: "already" }, { status: 409 });
    }
    // 42501 / 23514 / RLS denial → not mutual or target not considering.
    if (error.code === "42501" || error.message?.toLowerCase().includes("row-level security")) {
      return NextResponse.json(
        { error: "Not allowed — friend must be considering this event", code: "forbidden" },
        { status: 403 },
      );
    }
    console.error("[API convince POST]", error);
    return NextResponse.json({ error: "Failed to send convince" }, { status: 500 });
  }

  return NextResponse.json({ success: true, convince: data }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { supabase, user } = await getRouteAuth(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`convince:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = await parseAndValidate(request);
  if (parsed instanceof NextResponse) return parsed;

  const { error } = await supabase
    .from("convinces")
    .delete()
    .eq("from_user_id", user.id)
    .eq("to_user_id", parsed.toUserId)
    .eq("event_id", parsed.eventId);

  if (error) {
    console.error("[API convince DELETE]", error);
    return NextResponse.json({ error: "Failed to withdraw convince" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
