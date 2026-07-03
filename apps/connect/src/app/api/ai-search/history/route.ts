/**
 * GET /api/ai-search/history
 *
 * Returns the signed-in user's most recent AI bar searches (newest first,
 * capped to 50 by the rolling-trim trigger on `ai_search_queries`).  Used
 * by the Rainbow "?" long-form sheet to seed personalised question hints
 * and by the profile screen for "what you've been exploring lately".
 *
 * RLS limits the rows to the caller's own — no extra filter needed here,
 * but we still scope by `user_id` for clarity and defence-in-depth.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HISTORY = 50;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("ai_search_queries")
    .select("id, query, intent, result_ids, preferences_snapshot, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY);

  if (error) {
    console.error("[ai-search history]", error);
    return NextResponse.json({ error: "Could not load history" }, { status: 500 });
  }

  return NextResponse.json({ history: data ?? [] });
}
