/**
 * POST /api/admin/contributors/delete
 *
 * Admin-only. Hard-deletes a contributor application via the
 * `delete_contributor_application` RPC (added in migration 085). Used
 * by the admin review UI to discard non-actionable applications
 * (spam, duplicates, test rows) without polluting the queue.
 *
 * Body: { application_id: string }
 *
 * Auth: in-app admin session only. No email deep-link mode — discard
 * is destructive and we don't want to expose it over signed URLs.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  let payload: { application_id?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.application_id || !isValidUUID(payload.application_id)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const rl = checkRateLimit(
    `admin-contrib-delete:${guard.user.id}`,
    RATE_LIMITS.mutation,
  );
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() },
      },
    );
  }

  const { data, error } = await supabase.rpc("delete_contributor_application", {
    _application_id: payload.application_id,
  });

  if (error) {
    console.error("[/api/admin/contributors/delete] rpc", error);
    return NextResponse.json(
      { error: "delete_failed", detail: error.message },
      { status: 500 },
    );
  }

  const result = (data ?? {}) as { success?: boolean; reason?: string };
  if (!result.success) {
    const reason = result.reason ?? "unknown";
    const status = reason === "not_admin" ? 403 : reason === "not_found" ? 404 : 400;
    return NextResponse.json({ error: reason }, { status });
  }

  // Best-effort audit. Failure must not block the primary action.
  await logAdminAction(supabase, {
    actorId: guard.user.id,
    action: "contributor_application_deleted",
    targetType: "contributor_application",
    targetId: payload.application_id,
  });

  return NextResponse.json({ success: true });
}
