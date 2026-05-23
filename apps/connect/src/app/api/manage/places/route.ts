import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(`manage-places:${user.id}`, RATE_LIMITS.read);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // SQL aggregate via SECURITY INVOKER RPC (migration 094). One round-trip;
  // replaces the previous per-place client-side filter that fetched every
  // follow + review row for the caller's places.
  const { data, error } = await supabase.rpc("get_user_places_with_stats");

  if (error) {
    return NextResponse.json({ error: "Failed to load places" }, { status: 500 });
  }

  return NextResponse.json({ places: data ?? [] });
}
