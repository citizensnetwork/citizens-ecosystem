import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { requireOrgRole } from "@/lib/supabase/rbac";

/**
 * PATCH /api/connect/places/[id] — claim or unclaim a Connect place for an org.
 *
 * Claims live in vision.cc_place_claims (PK cc_place_id → one org per place).
 * `claim` inserts an exclusive row; `unclaim` removes this org's row.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid place ID" }, { status: 400 });
  }

  let body: { org_id?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { org_id, action } = body;

  if (!org_id || !isValidUUID(org_id)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  // Verify admin/manager role
  const auth = await requireOrgRole(supabase, user.id, org_id, [
    "org_admin",
    "org_manager",
  ]);
  if (!auth.ok) return auth.response;

  if (action === "claim") {
    const { error } = await supabase.from("cc_place_claims").insert({
      cc_place_id: id,
      cv_org_id: org_id,
      claimed_by: user.id,
    });

    if (error) {
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("cc_place_claims")
          .select("cv_org_id")
          .eq("cc_place_id", id)
          .maybeSingle();
        if (existing?.cv_org_id !== org_id) {
          return NextResponse.json(
            { error: "This place is already claimed by another organisation" },
            { status: 409 }
          );
        }
        // Same org re-claiming — idempotent, fall through to return the row.
      } else {
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }
    }

    const { data: row } = await supabase
      .from("cc_place_claims")
      .select("*")
      .eq("cc_place_id", id)
      .eq("cv_org_id", org_id)
      .single();

    return NextResponse.json(row);
  }

  if (action === "unclaim") {
    const { error } = await supabase
      .from("cc_place_claims")
      .delete()
      .eq("cc_place_id", id)
      .eq("cv_org_id", org_id);

    if (error) {
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ cc_place_id: id, cv_org_id: null });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
