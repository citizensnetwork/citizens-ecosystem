/**
 * GET   /api/admin/users?q=&page=&status=    — paginated user list (admin-only)
 * PATCH /api/admin/users                     — update role + contributor_status
 *
 * Guards:
 *   - admin-only (server role check)
 *   - block self-demotion from admin (avoid org lockout)
 *   - validates role + contributor_status against the canonical enums
 *   - role=admin elevations go through dual-admin approval (Batch F) —
 *     the PATCH returns `{ pending: true, request_id }` rather than
 *     applying the change directly.
 *
 * Every mutation writes an `admin_actions` row for audit.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["citizen", "contributor", "admin"] as const;
const ALLOWED_CONTRIB_STATUS = [
  "not_applied",
  "pending",
  "approved",
  "rejected",
] as const;
const ALLOWED_CONTRIB_KINDS = ["ministry", "organization", "business"] as const;
const PAGE_SIZE = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  // Light read cap — defence-in-depth for admin session compromise
  // (Architect audit L3).
  const rl = checkRateLimit(`admin-users-get:${guard.user.id}`, RATE_LIMITS.read);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() },
      },
    );
  }

  const url = new URL(request.url);
  const rawQ = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const allowlisted = rawQ.replace(/[^a-zA-Z0-9 \-'@._]/g, " ").trim();
  // Escape PostgREST/SQL LIKE special characters that survive the
  // allowlist (`_` is allowed in the allowlist so users can search
  // by handle/email containing it, but it must not act as a wildcard).
  // `%` is excluded by the allowlist but escape defensively too.
  const q = allowlisted.replace(/[\\%_]/g, "\\$&");
  const pageRaw = parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.min(pageRaw, 500)) : 1;
  const status = url.searchParams.get("status");

  const offset = (page - 1) * PAGE_SIZE;
  let query = supabase
    .from("profiles")
    .select(
      "id, email, full_name, avatar_url, role, contributor_kind, contributor_status, contributor_slug, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (q) {
    // Use explicit ilike with the escaped-or() pattern. PostgREST's or()
    // parser requires commas only as operator separators — our allowlist
    // already removed them from q.
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  }
  if (status === "pending" || status === "approved" || status === "rejected") {
    query = query.eq("contributor_status", status);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[admin/users GET]", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  return NextResponse.json({
    data: data ?? [],
    meta: { page, pageSize: PAGE_SIZE, total: count ?? 0 },
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const rl = checkRateLimit(`admin-users-patch:${guard.user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() },
      },
    );
  }

  let body: {
    user_id?: string;
    role?: string;
    contributor_status?: string;
    contributor_kind?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.user_id || !UUID_RE.test(body.user_id)) {
    return NextResponse.json({ error: "Valid user_id required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (body.role !== undefined) {
    if (!ALLOWED_ROLES.includes(body.role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    // Lockout guard: cannot demote yourself out of admin.
    if (body.user_id === guard.user.id && body.role !== "admin") {
      return NextResponse.json(
        { error: "You cannot demote your own admin account." },
        { status: 400 },
      );
    }
    // Last-admin lockout guard: refuse to demote the final admin.
    // (Architect audit L1.)
    //
    // NOTE: The count + target-role fetches below are non-transactional
    // so two admins demoting each other concurrently could both pass
    // this preflight. The authoritative guard is the
    // `enforce_at_least_one_admin` BEFORE trigger which raises P0001
    // (handled by the 400 branch lower in this route). This preflight
    // is UX-only — it gives the caller a clear, fast 400 in the common
    // single-admin-clicks-demote case before we hit the DB constraint.
    if (body.role !== "admin") {
      const { count: adminCount } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      const { data: target } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", body.user_id)
        .maybeSingle();
      if (
        target?.role === "admin" &&
        typeof adminCount === "number" &&
        adminCount <= 1
      ) {
        return NextResponse.json(
          { error: "Cannot demote the last remaining admin." },
          { status: 400 },
        );
      }
    }

    // Dual-admin approval gate (Batch F). Only role=admin goes through
    // the queue; every other role is applied inline. If the target is
    // already an admin, this is a no-op (skip the queue).
    if (body.role === "admin") {
      const { data: target } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", body.user_id)
        .maybeSingle();
      if (target?.role === "admin") {
        return NextResponse.json({
          success: true,
          noop: true,
        });
      }

      const { data: inserted, error: insErr } = await supabase
        .from("pending_admin_elevations")
        .insert({
          target_user_id: body.user_id,
          requested_by: guard.user.id,
          reason: null,
        })
        .select("id")
        .maybeSingle();

      if (insErr) {
        // 23505 → pending row already exists for this target.
        if (insErr.code === "23505") {
          return NextResponse.json(
            { error: "An admin elevation is already pending for this user." },
            { status: 409 },
          );
        }
        console.error("[admin/users PATCH insert pending]", insErr);
        return NextResponse.json(
          { error: "Failed to queue admin elevation" },
          { status: 500 },
        );
      }

      // Notify every OTHER admin (not the requester) in-app.
      try {
        const { data: otherAdmins } = await supabase
          .from("profiles")
          .select("id")
          .eq("role", "admin")
          .neq("id", guard.user.id);
        if (otherAdmins && otherAdmins.length > 0 && inserted?.id) {
          await supabase.from("notifications").insert(
            otherAdmins.map((a) => ({
              user_id: a.id,
              type: "admin_elevation_request",
              title: "Admin elevation awaiting approval",
              body: "A new admin elevation request needs a second admin's approval.",
              link_url: "/admin/users#admin-elevations",
              metadata: { request_id: inserted.id },
            })),
          );
        }
      } catch (err) {
        console.warn("[admin/users PATCH notify]", err);
      }

      await logAdminAction(supabase, {
        actorId: guard.user.id,
        action: "user.admin_elevation.requested",
        targetType: "profile",
        targetId: body.user_id,
        metadata: { request_id: inserted?.id },
      });

      return NextResponse.json({
        success: true,
        pending: true,
        request_id: inserted?.id,
      });
    }

    patch.role = body.role;
  }

  if (body.contributor_status !== undefined) {
    if (
      !ALLOWED_CONTRIB_STATUS.includes(
        body.contributor_status as (typeof ALLOWED_CONTRIB_STATUS)[number],
      )
    ) {
      return NextResponse.json(
        { error: "Invalid contributor_status" },
        { status: 400 },
      );
    }
    patch.contributor_status = body.contributor_status;
  }

  if (body.contributor_kind !== undefined) {
    if (
      body.contributor_kind !== null &&
      !ALLOWED_CONTRIB_KINDS.includes(
        body.contributor_kind as (typeof ALLOWED_CONTRIB_KINDS)[number],
      )
    ) {
      return NextResponse.json(
        { error: "Invalid contributor_kind" },
        { status: 400 },
      );
    }
    patch.contributor_kind = body.contributor_kind;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No changes supplied" }, { status: 400 });
  }

  // Role column is protected by a DB trigger so self-escalation is
  // blocked at the database level. Admin updates use the RPC-
  // equivalent `is_admin()` check in the policy (migration 063);
  // service_role is not needed here because admins can bypass the
  // protect_role_column trigger via is_admin().
  //
  // `.select()` forces PostgREST to echo the affected rows, which we
  // use below to detect the silent-zero-row case — if RLS ever stops
  // admins from updating profiles again (e.g. someone drops the
  // policy), the API surfaces a clear 500 instead of pretending the
  // change landed.
  const { data: updatedRows, error: updErr } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", body.user_id)
    .select("id");

  if (updErr) {
    // Trigger `enforce_at_least_one_admin` raises P0001 with a
    // friendly message if the update would leave zero admins. Surface
    // it as 400 so concurrent demotions are rejected cleanly even
    // when the JS preflight missed the race.
    if (updErr.code === "P0001") {
      return NextResponse.json(
        { error: updErr.message ?? "Cannot remove the last admin." },
        { status: 400 },
      );
    }
    console.error("[admin/users PATCH]", updErr);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 },
    );
  }

  if (!updatedRows || updatedRows.length === 0) {
    // RLS filtered out every row — either the target user vanished
    // between preflight + update, or the admin update policy was
    // revoked. Surface it loudly in server logs; return a generic
    // message to the client to avoid leaking internal scaffolding.
    console.error(
      "[admin/users PATCH] zero rows updated — RLS or missing target",
      { target: body.user_id },
    );
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 },
    );
  }

  await logAdminAction(supabase, {
    actorId: guard.user.id,
    action: "user.update",
    targetType: "profile",
    targetId: body.user_id,
    metadata: patch,
  });

  return NextResponse.json({ success: true });
}
