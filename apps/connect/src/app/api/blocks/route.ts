/**
 * POST /api/blocks   — block a user
 * DELETE /api/blocks — unblock a user
 */

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`blocks:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { blocked_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { blocked_id } = body;
  if (typeof blocked_id !== "string" || !isValidUUID(blocked_id)) {
    return NextResponse.json({ error: "Invalid blocked_id" }, { status: 400 });
  }
  if (blocked_id === user.id) {
    return NextResponse.json({ error: "Cannot block yourself" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_blocks")
    .insert({ blocker_id: user.id, blocked_id });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already blocked" }, { status: 409 });
    }
    console.error("[/api/blocks POST]", error);
    return NextResponse.json({ error: "Failed to block user" }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`blocks:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { blocked_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { blocked_id } = body;
  if (typeof blocked_id !== "string" || !isValidUUID(blocked_id)) {
    return NextResponse.json({ error: "Invalid blocked_id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", blocked_id);

  if (error) {
    console.error("[/api/blocks DELETE]", error);
    return NextResponse.json({ error: "Failed to unblock user" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
