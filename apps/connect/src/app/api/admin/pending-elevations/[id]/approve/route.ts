/**
 * POST /api/admin/pending-elevations/[id]/approve  — approve a queued elevation
 * POST /api/admin/pending-elevations/[id]/reject   — reject a queued elevation
 *
 * Approve/reject both go through Postgres RPCs that encode the
 * dual-admin rule (different approver, or 24h cooling-off for solo
 * admins). See migration 058.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; action?: string }> },
) {
  const { id } = await ctx.params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  // Distinguish approve vs reject by the final URL segment — the file
  // lives at [id]/route.ts under the intent-specific folder, so we
  // inspect pathname.
  const segs = request.nextUrl.pathname.split("/").filter(Boolean);
  const intent = segs[segs.length - 1] as "approve" | "reject";
  if (intent !== "approve" && intent !== "reject") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const rl = await checkRateLimit(
    `admin-elevations-${intent}:${guard.user.id}`,
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

  let reason: string | null = null;
  if (intent === "reject") {
    try {
      const body = (await request.json()) as { reason?: string };
      if (typeof body.reason === "string") {
        reason = body.reason.trim().slice(0, 500) || null;
      }
    } catch {
      // Body is optional.
    }
  }

  if (intent === "approve") {
    const { error } = await supabase.rpc("approve_admin_elevation", {
      p_request_id: id,
    });
    if (error) {
      // RPC raises with codes P0001 / P0002 / 42501 / 28000. Surface
      // the DB message (already user-safe) so the UI can show the rule
      // hit (different-approver required, cooling-off, expired).
      console.warn("[elevation approve]", error);
      return NextResponse.json(
        { error: error.message ?? "Approval failed" },
        { status: error.code === "P0002" ? 404 : 400 },
      );
    }
    await logAdminAction(supabase, {
      actorId: guard.user.id,
      action: "user.admin_elevation.approved",
      targetType: "pending_admin_elevations",
      targetId: id,
    });
    return NextResponse.json({ success: true });
  }

  // reject
  const { error } = await supabase.rpc("reject_admin_elevation", {
    p_request_id: id,
    p_reason: reason,
  });
  if (error) {
    console.warn("[elevation reject]", error);
    return NextResponse.json(
      { error: error.message ?? "Rejection failed" },
      { status: error.code === "P0002" ? 404 : 400 },
    );
  }
  await logAdminAction(supabase, {
    actorId: guard.user.id,
    action: "user.admin_elevation.rejected",
    targetType: "pending_admin_elevations",
    targetId: id,
    metadata: reason ? { reason } : undefined,
  });
  return NextResponse.json({ success: true });
}
