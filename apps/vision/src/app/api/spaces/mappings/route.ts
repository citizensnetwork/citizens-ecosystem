import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { setMappingSchema } from "@/lib/schemas/space";
import { connectApi, ConnectApiError } from "@/lib/connect/api";

// GET /api/spaces/mappings?org_id=<uuid>
//   The Connect categories (from /api/v1/categories) joined with THIS org's
//   current category→space assignment, for the Configure Spaces mapping UI
//   (VISION_BACKEND_WIRING_SPEC §3.5a / §3.10). Current assignments come from
//   the SECDEF reader vision.get_category_spaces (mig 152) so any org_member
//   sees them — vision.category_space_map's own RLS only lets the Connect link
//   owner read raw rows.
//
// PUT /api/spaces/mappings?org_id=<uuid>   body { category_id, space_id|null }
//   Assign one category to a space (single-select; null clears it). Routed to
//   the SECDEF writer vision.set_category_space (mig 151, is_org_admin gated),
//   so any admin of the linked org can map, not only the link owner.

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
    return NextResponse.json({ error: "Valid org_id is required" }, { status: 400 });
  }

  // Current assignments first (cheap, membership-gated). 42501 → 403.
  const mapping = await supabase.rpc("get_category_spaces", { p_org_id: orgId });
  if (mapping.error?.code === "42501") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const spaceByCat = new Map<string, string>();
  for (const m of mapping.error ? [] : (mapping.data ?? [])) {
    spaceByCat.set(m.category_id, m.space_id);
  }

  // Connect categories over the /api/v1 contract (event-applicable set).
  let categories;
  try {
    const res = await connectApi.listCategories({ applies_to: "events" });
    categories = res.data;
  } catch (err) {
    if (err instanceof ConnectApiError) {
      return NextResponse.json(
        { error: "Citizens Connect API is unavailable" },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  const data = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    emoji: c.emoji,
    color: c.color,
    space_id: spaceByCat.get(c.id) ?? null,
  }));

  return NextResponse.json({ data });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("org_id");
  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json({ error: "Valid org_id is required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = setMappingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { error } = await supabase.rpc("set_category_space", {
    p_org_id: orgId,
    p_category_id: parsed.data.category_id,
    p_space_id: parsed.data.space_id,
  });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // 22023 = org unlinked / space not in org (raised inside the writer).
    if (error.code === "22023") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
