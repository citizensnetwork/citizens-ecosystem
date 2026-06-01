import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isBroadcastReactionEmoji } from "@/lib/broadcasts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — add an anonymous reaction to a broadcast message.
 *
 * Body: { emoji: string } — must be one of the five fixed BROADCAST_REACTION_EMOJI.
 *
 * Reactions are aggregate-only and identity-free: the SECURITY DEFINER RPC
 * `increment_broadcast_reaction` (migration 128) bumps a per-(broadcast, emoji)
 * counter without recording who reacted. Auth + rate limiting are the only
 * abuse controls, since there is no per-user row to dedupe against.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`broadcast-react:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const emoji = (body as { emoji?: unknown })?.emoji;
  if (!isBroadcastReactionEmoji(emoji)) {
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("increment_broadcast_reaction", {
    p_broadcast_id: id,
    p_emoji: emoji,
  });

  if (error) {
    // The RPC raises broadcast_not_found (P0002) for missing/soft-deleted rows.
    if (error.code === "P0002") {
      return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
    }
    console.error("[API broadcasts react POST]", error);
    return NextResponse.json(
      { error: "Failed to record reaction" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, emoji, count: data as number });
}
