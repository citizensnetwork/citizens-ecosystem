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
  const claimed = searchParams.get("claimed");
  const category = searchParams.get("category");
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

  // Build query: unclaimed OR claimed by this org
  let query = supabase
    .from("cc_events_mirror")
    .select("*", { count: "exact" });

  if (claimed === "true") {
    query = query.eq("cv_org_id", orgId);
  } else if (claimed === "false") {
    query = query.is("cv_org_id", null);
  } else {
    // Default: show unclaimed + org-claimed
    query = query.or(`cv_org_id.is.null,cv_org_id.eq.${orgId}`);
  }

  if (category) {
    query = query.eq("category", category);
  }

  query = query
    .order("date", { ascending: false, nullsFirst: false })
    .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1);

  const { data: events, count, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    events: events ?? [],
    total: count ?? 0,
    page,
    per_page: ITEMS_PER_PAGE,
  });
}
