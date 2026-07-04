/**
 * FEAT-05 broadcast updates — single-row endpoints.
 *
 * DELETE /api/events/:id/updates/:updateId
 *   Authenticated. RLS (policy `event_updates_delete_author_or_admin` from
 *   migration 030) restricts removal to the row's author or a profile with
 *   role = 'admin'. We do not duplicate that check in the Node layer — the
 *   DB is the source of truth — but we DO translate RLS denial into a 403
 *   so the UI can show a clean error instead of a generic 500.
 *
 * We also validate the URL UUIDs up front to avoid an obvious 22P02 cast
 * error from Postgres polluting telemetry.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; updateId: string }> },
) {
  const { id, updateId } = await params;

  if (!isValidUUID(id) || !isValidUUID(updateId)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // We scope the DELETE by both event_id and id so a malicious caller can't
  // delete a row from a different event by guessing UUIDs. RLS would still
  // block it, but pinning both columns also produces a deterministic
  // "row not found" path when the IDs don't line up.
  const { data, error } = await supabase
    .from("event_updates")
    .delete()
    .eq("event_id", id)
    .eq("id", updateId)
    .select("id")
    .maybeSingle();

  if (error) {
    // RLS denial surfaces as code 42501 or the readable message below.
    const isRlsDenial =
      error.code === "42501" || /row-level security/i.test(error.message);
    if (isRlsDenial) {
      return NextResponse.json(
        { error: "You don't have permission to delete this update" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    // Either the update didn't exist, or RLS hid it from the SELECT after
    // delete. We treat both as 404 — the resource is gone from the caller's
    // POV either way.
    return NextResponse.json({ error: "Update not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
