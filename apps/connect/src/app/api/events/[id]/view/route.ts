import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only track views for authenticated users (prevents anonymous flood)
  if (!user) {
    return NextResponse.json({ success: true });
  }

  // Upsert: one view per user per day (unique index handles dedup)
  await supabase.from("event_views").insert({
    event_id: id,
    user_id: user.id,
  });

  return NextResponse.json({ success: true });
}
