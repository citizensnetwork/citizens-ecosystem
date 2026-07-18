import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

/**
 * GET /api/metrics/activities?org_id=<uuid>
 *
 * Per-activity Reach / Engagement / Rating for the Activities log (spec §3.2b).
 * Wraps the SECURITY DEFINER vision.activity_metrics(org) reader (migration 153),
 * which returns one row per CLAIMED activity (an activity linked to a claimed
 * Connect event via cc_event_claims) — manual / unclaimed activities are absent
 * (they carry no Connect metrics; the frontend renders their cells as an em dash).
 *
 * The reader is membership-gated: a non-member call raises 42501 → mapped to 403.
 * The frontend calls this best-effort alongside GET /api/activities and merges by
 * activity_id, so a failure here just leaves the table without metrics rather than
 * breaking the log.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("org_id");

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc("activity_metrics", {
    p_org_id: orgId,
  });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[API metrics activities]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
