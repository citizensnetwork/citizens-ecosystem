import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { requireOrgRole } from "@/lib/supabase/rbac";
import { connectApi, ConnectApiError } from "@/lib/connect/api";

/**
 * POST /api/connect/link — link a Vision org to its Citizens Connect contributor.
 *
 * The org admin supplies their Connect contributor vanity slug; we resolve it to
 * the contributor's profile id via /api/v1 and store it on
 * vision.organisations.connect_contributor_id. The Connect feed (events/places)
 * is then scoped to that contributor.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { org_id?: string; slug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const orgId = body.org_id;
  const slug = body.slug?.trim().toLowerCase();

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }
  if (!slug) {
    return NextResponse.json(
      { error: "A Citizens Connect contributor slug is required" },
      { status: 400 }
    );
  }
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) {
    return NextResponse.json(
      { error: "Invalid contributor slug" },
      { status: 400 }
    );
  }

  // Only org admins may set the ecosystem identity link.
  const auth = await requireOrgRole(supabase, user.id, orgId, ["org_admin"]);
  if (!auth.ok) return auth.response;

  // Resolve the slug to a Connect contributor id.
  let contributorId: string;
  let contributorName: string;
  try {
    const { data } = await connectApi.getContributor(slug);
    contributorId = data.profile.id;
    contributorName = data.profile.full_name;
  } catch (error) {
    if (error instanceof ConnectApiError) {
      const status = error.status === 404 ? 404 : 502;
      const message =
        status === 404
          ? "No approved Citizens Connect contributor found for that slug"
          : "Citizens Connect API is unavailable";
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  // Ownership guard: a Connect contributor's profile id IS its auth user id (shared
  // auth.users). Only allow linking the contributor the requesting admin actually owns,
  // so an org can't hijack another contributor's events/places via the exclusive claims.
  if (contributorId !== user.id) {
    return NextResponse.json(
      { error: "You can only link a Citizens Connect contributor that you own" },
      { status: 403 }
    );
  }

  const { error: updateError } = await supabase
    .from("organisations")
    .update({ connect_contributor_id: contributorId })
    .eq("id", orgId);

  if (updateError) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    connect_contributor_id: contributorId,
    contributor: { slug, name: contributorName },
  });
}
