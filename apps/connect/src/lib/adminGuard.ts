/**
 * Shared helpers for admin-only API routes.
 *
 * - `requireAdmin(supabase)` — returns the admin user profile or a
 *   `NextResponse` denial. Consolidates the same auth+role check that
 *   was previously hand-rolled in each admin route.
 * - `logAdminAction(...)` — best-effort append to `admin_actions`. Never
 *   throws; an audit failure must not block the primary action.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AdminGuard =
  | { ok: true; user: User }
  | { ok: false; deny: NextResponse };

export async function requireAdmin(
  supabase: SupabaseClient,
): Promise<AdminGuard> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      deny: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") {
    return {
      ok: false,
      deny: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, user };
}

export async function logAdminAction(
  supabase: SupabaseClient,
  entry: {
    actorId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await supabase.from("admin_actions").insert({
      actor_id: entry.actorId,
      action: entry.action.slice(0, 64),
      target_type: entry.targetType?.slice(0, 32) ?? null,
      target_id: entry.targetId?.slice(0, 200) ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (err) {
    // Audit failure must never block the primary action. Log and move on.
    console.warn("[admin audit] insert failed", err);
  }
}
