import { getRouteAuth } from "@/lib/supabase/route";
import { NextResponse, type NextRequest } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — dismiss a map update bubble for the current user only.
 *
 * Delegates to the SECURITY DEFINER RPC `dismiss_map_bubble` (migration 129),
 * which records a per-user dismissal idempotently. The bubble stays visible to
 * everyone else and disappears for this user until it expires (~24h).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  const { supabase, user } = await getRouteAuth(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`bubble-dismiss:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { error } = await supabase.rpc("dismiss_map_bubble", {
    p_bubble_id: id,
  });

  if (error) {
    console.error("[API map bubble dismiss POST]", error);
    return NextResponse.json(
      { error: "Failed to dismiss bubble" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
