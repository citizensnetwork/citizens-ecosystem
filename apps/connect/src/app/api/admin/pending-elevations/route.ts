/**
 * GET  /api/admin/pending-elevations  — list pending admin-elevation requests
 *
 * Admin-only. Returns the queue of pending rows joined with target +
 * requester display info so the UI can render who-requested-whom.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/adminGuard";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const rl = await checkRateLimit(
    `admin-elevations-list:${guard.user.id}`,
    RATE_LIMITS.read,
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

  const { data, error } = await supabase
    .from("pending_admin_elevations")
    .select(
      `id, target_user_id, requested_by, requested_at, expires_at, status,
       target:profiles!pending_admin_elevations_target_user_id_fkey(id, full_name, email),
       requester:profiles!pending_admin_elevations_requested_by_fkey(id, full_name, email)`,
    )
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[pending-elevations GET]", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    viewer_id: guard.user.id,
  });
}
