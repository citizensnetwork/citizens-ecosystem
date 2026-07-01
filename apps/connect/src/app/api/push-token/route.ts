import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`push:${user.id}`, RATE_LIMITS.heavy);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token, platform } = body;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  if (token.length > 500) {
    return NextResponse.json({ error: "Token too long" }, { status: 400 });
  }

  if (!["ios", "android", "web"].includes(platform)) {
    return NextResponse.json(
      { error: "Platform must be ios, android, or web" },
      { status: 400 }
    );
  }

  // Upsert: if token already exists for this user, just update created_at
  const { error } = await supabase.from("push_tokens").upsert(
    { user_id: user.id, token, platform },
    { onConflict: "user_id,token" }
  );

  if (error) {
    console.error("[API push-token POST]", error);
    return NextResponse.json({ error: "Failed to register push token" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Share the `push:${user.id}` bucket with POST: register/unregister storms
  // are the same abuse pattern (token churn) and legitimate clients only
  // call this once on logout.
  const rl = await checkRateLimit(`push:${user.id}`, RATE_LIMITS.heavy);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { token } = body;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("push_tokens")
    .delete()
    .eq("user_id", user.id)
    .eq("token", token);

  if (error) {
    console.error("[API push-token DELETE]", error);
    return NextResponse.json({ error: "Failed to remove push token" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
