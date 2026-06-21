import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import {
  getOrgConnectContributorId,
  listOrgConnectPlaces,
} from "@/lib/connect/feed";
import { ConnectApiError } from "@/lib/connect/api";

/**
 * GET /api/connect/places — the org's Citizens Connect places with claim status.
 *
 * Reads live from Connect's /api/v1 (scoped to the org's linked contributor) and
 * overlays this org's claims from vision.cc_place_claims.
 */
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
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

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

  const connectContributorId = await getOrgConnectContributorId(supabase, orgId);

  try {
    const { places, total, linked } = await listOrgConnectPlaces(supabase, {
      orgId,
      connectContributorId,
      page,
      perPage: ITEMS_PER_PAGE,
    });

    return NextResponse.json({
      places,
      total,
      page,
      per_page: ITEMS_PER_PAGE,
      linked,
    });
  } catch (error) {
    if (error instanceof ConnectApiError) {
      return NextResponse.json(
        { error: "Citizens Connect API is unavailable" },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
