import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { ITEMS_PER_PAGE } from "@/lib/constants";

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
  const severity = searchParams.get("severity");
  const type = searchParams.get("type");
  const dismissed = searchParams.get("dismissed");
  const page = parseInt(searchParams.get("page") ?? "1", 10);

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

  // Build query
  let query = supabase
    .from("advisory_outputs")
    .select("*, advisory_templates(type, title_template, severity)", { count: "exact" })
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (severity) {
    query = query.eq("severity", severity);
  }

  if (type) {
    query = query.eq("advisory_templates.type", type);
  }

  if (dismissed === "true") {
    query = query.eq("dismissed", true);
  } else if (dismissed === "false" || !dismissed) {
    // Default: show active (non-dismissed) advisories
    query = query.eq("dismissed", false);
  }

  const from = (page - 1) * ITEMS_PER_PAGE;
  query = query.range(from, from + ITEMS_PER_PAGE - 1);

  const { data: advisories, count, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  // Also get summary counts by severity for dashboard integration
  const [infoCount, warningCount, criticalCount] = await Promise.all([
    supabase
      .from("advisory_outputs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("dismissed", false)
      .eq("severity", "info"),
    supabase
      .from("advisory_outputs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("dismissed", false)
      .eq("severity", "warning"),
    supabase
      .from("advisory_outputs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("dismissed", false)
      .eq("severity", "critical"),
  ]);

  return NextResponse.json({
    advisories: advisories ?? [],
    total: count ?? 0,
    page,
    per_page: ITEMS_PER_PAGE,
    summary: {
      info: infoCount.count ?? 0,
      warning: warningCount.count ?? 0,
      critical: criticalCount.count ?? 0,
    },
  });
}
