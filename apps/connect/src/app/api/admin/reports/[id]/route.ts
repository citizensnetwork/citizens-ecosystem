/**
 * PATCH /api/admin/reports/[id] — resolve a report.
 *
 * Body: { status: "actioned" | "dismissed", resolution_notes?: string }
 *
 * Admin-only. Writes the transition + notes to the row AND logs an
 * append-only entry in `admin_actions` so every decision is auditable.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { isValidUUID } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = ["actioned", "dismissed"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];
const MAX_NOTES_LEN = 1000;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { status, resolution_notes } = payload as {
    status?: unknown;
    resolution_notes?: unknown;
  };

  if (
    typeof status !== "string" ||
    !ALLOWED_STATUSES.includes(status as AllowedStatus)
  ) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  let cleanNotes: string | null = null;
  if (resolution_notes !== undefined && resolution_notes !== null) {
    if (typeof resolution_notes !== "string") {
      return NextResponse.json(
        { error: "Invalid resolution_notes" },
        { status: 400 },
      );
    }
    const trimmed = resolution_notes.trim();
    if (trimmed.length > MAX_NOTES_LEN) {
      return NextResponse.json(
        { error: `Notes must be ${MAX_NOTES_LEN} characters or fewer` },
        { status: 400 },
      );
    }
    cleanNotes = trimmed.length ? trimmed : null;
  }

  // Only transition open → actioned/dismissed.  Guarding here prevents a
  // second admin (or a stale tab) from silently overwriting a prior
  // resolution's resolved_by / resolved_at / notes.
  const { data, error } = await supabase
    .from("reports")
    .update({
      status,
      resolved_by: guard.user.id,
      resolved_at: new Date().toISOString(),
      resolution_notes: cleanNotes,
    })
    .eq("id", id)
    .eq("status", "open")
    .select("id, target_type, target_id, status")
    .maybeSingle();

  if (error) {
    console.error("[/api/admin/reports PATCH]", error);
    return NextResponse.json(
      { error: "Failed to update report" },
      { status: 500 },
    );
  }
  if (!data) {
    // Either the id does not exist or the report is already resolved.
    // Look up the current row (bypassing the status filter) to tell the
    // caller which it is; both are admin-visible via RLS.
    const { data: existing } = await supabase
      .from("reports")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Report is already resolved" },
      { status: 409 },
    );
  }

  await logAdminAction(supabase, {
    actorId: guard.user.id,
    action: `report.${status}`,
    targetType: "report",
    targetId: id,
    metadata: {
      report_target_type: data.target_type,
      report_target_id: data.target_id,
    },
  });

  return NextResponse.json({ report: data });
}
