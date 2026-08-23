/**
 * POST /api/admin/contributors/hide
 *
 * Admin-only. Toggles `profiles.contributor_hidden` via the
 * `set_contributor_hidden` RPC (migration 164) — the moderation safety
 * net for v1's self-serve go-live (no pre-publish admin review). Hiding
 * removes a Contributor from `directory_contributors` and
 * `/api/v1/contributors` without rejecting their application or deleting
 * their data, so it's reversible.
 *
 * Body: { user_id: string (uuid), hidden: boolean }
 */

import { getRouteAuth } from "@/lib/supabase/route";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { supabase } = await getRouteAuth(request);

  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const rl = await checkRateLimit(`admin-hide-contributor:${guard.user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
    );
  }

  let payload: { user_id?: string; hidden?: boolean };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!payload.user_id || !isValidUUID(payload.user_id) || typeof payload.hidden !== "boolean") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("set_contributor_hidden", {
    _user_id: payload.user_id,
    _hidden: payload.hidden,
  });

  if (error) {
    console.error("[/api/admin/contributors/hide] rpc", error);
    return NextResponse.json({ error: "hide_failed" }, { status: 500 });
  }
  const result = data as { success?: boolean; reason?: string } | null;
  if (!result?.success) {
    const status = result?.reason === "not_admin" ? 403 : 404;
    return NextResponse.json({ error: result?.reason ?? "hide_failed" }, { status });
  }

  await logAdminAction(supabase, {
    actorId: guard.user.id,
    action: payload.hidden ? "contributor_hidden" : "contributor_unhidden",
    targetType: "profile",
    targetId: payload.user_id,
  });

  return NextResponse.json({ success: true, user_id: payload.user_id, hidden: payload.hidden });
}
