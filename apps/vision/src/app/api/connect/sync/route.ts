import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const orgId = searchParams.get("org_id");

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  // Verify membership
  const { data: membership } = await supabase
    .from("user_org_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Get last 20 sync logs
  const { data: logs, error } = await supabase
    .from("cc_sync_log")
    .select("*")
    .eq("org_id", orgId)
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  // Get counts of mirrored records
  const [eventsResult, placesResult] = await Promise.all([
    supabase
      .from("cc_events_mirror")
      .select("cc_event_id", { count: "exact", head: true })
      .eq("cv_org_id", orgId),
    supabase
      .from("cc_places_mirror")
      .select("cc_place_id", { count: "exact", head: true })
      .eq("cv_org_id", orgId),
  ]);

  return NextResponse.json({
    logs: logs ?? [],
    stats: {
      claimed_events: eventsResult.count ?? 0,
      claimed_places: placesResult.count ?? 0,
      last_sync: logs?.[0] ?? null,
    },
  });
}
