import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { requireOrgRole } from "@/lib/supabase/rbac";

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
    return NextResponse.json(
      { error: "Invalid advisory ID" },
      { status: 400 }
    );
  }

  let body: { org_id?: string; action?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { org_id, action, notes } = body;

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

  if (action === "dismiss") {
    const { data: updated, error } = await supabase
      .from("advisory_outputs")
      .update({
        dismissed: true,
        dismissed_at: new Date().toISOString(),
        dismissed_notes: typeof notes === "string" ? notes : null,
      })
      .eq("id", id)
      .eq("org_id", org_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
