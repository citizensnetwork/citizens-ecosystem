/**
 * Admin → Citizens "Delete account".
 *
 *   GET  /api/admin/citizens/delete?id=<uuid>
 *        Read-only preflight: display name, what will be removed, blockers.
 *        No email.
 *   POST /api/admin/citizens/delete   { id, confirmName }
 *        Hard-deletes a Citizen account. `confirmName` must equal the
 *        display name. The database decides; the client is not trusted.
 *
 * Auth: Bearer via getRouteAuth(), then requireAdmin(). The RPC runs on
 * the admin's own session (`admin_delete_citizen_account`, migration 194).
 * Its guard raises unless auth.uid() is an admin. service_role is used
 * only afterwards, for Storage cleanup.
 */

import { getRouteAuth } from "@/lib/supabase/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC = "admin_delete_citizen_account";
const IMAGE_BUCKET = "event-images";
const MAX_CONFIRM_NAME = 200;

type RpcResult = {
  success?: boolean;
  reason?: string;
  blockers?: string[];
  outcome?: "deleted";
  name?: string | null;
  follows?: number;
  place_follows?: number;
  saves?: number;
  rsvps?: number;
  comments?: number;
  moments?: number;
  messages?: number;
  notifications?: number;
};

const BLOCKER_TEXT: Record<string, string> = {
  owns_wear_brand: "owns a Citizens Wear brand",
  created_vision_organisation: "created an organisation in Citizens Vision",
  has_vision_activity: "has activity in Citizens Vision",
};

const REFUSALS: Record<string, { status: number; message: string }> = {
  not_admin: { status: 403, message: "Forbidden" },
  not_found: { status: 404, message: "That account no longer exists." },
  cannot_delete_self: { status: 409, message: "You can't delete your own account." },
  target_is_admin: { status: 409, message: "That account is an admin, so it can't be deleted here." },
  not_a_citizen: {
    status: 409,
    message: "That account is a Contributor listing. Delete it from Contributors.",
  },
  name_mismatch: { status: 400, message: "The name you typed doesn't match this account." },
  blocked_by_related_data: {
    status: 409,
    message: "Other data in Citizens still depends on this account, so it can't be deleted.",
  },
};

function blockedMessage(blockers: string[]): string {
  const reasons = blockers.map((b) => BLOCKER_TEXT[b] ?? "has linked data elsewhere in Citizens");
  return `This account ${reasons.join(" and ")}, so it can't be deleted here. Clear that first.`;
}

function isNotAdmin(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42501" || error.message === "not_admin";
}

function refusal(result: RpcResult) {
  if (result.reason === "blocked") {
    const blockers = result.blockers ?? [];
    return NextResponse.json(
      { error: "blocked", blockers, message: blockedMessage(blockers) },
      { status: 409 },
    );
  }
  const known = result.reason ? REFUSALS[result.reason] : undefined;
  if (known) return NextResponse.json({ error: result.reason, message: known.message }, { status: known.status });
  return NextResponse.json({ error: "delete_failed" }, { status: 500 });
}

/** Counts and the display name only. Email is never a field we forward. */
function publicPreflight(result: RpcResult) {
  const blockers = result.blockers ?? [];
  return {
    name: result.name ?? "",
    follows: result.follows ?? 0,
    placeFollows: result.place_follows ?? 0,
    saves: result.saves ?? 0,
    rsvps: result.rsvps ?? 0,
    comments: result.comments ?? 0,
    moments: result.moments ?? 0,
    messages: result.messages ?? 0,
    notifications: result.notifications ?? 0,
    blockers,
    ...(blockers.length > 0 ? { message: blockedMessage(blockers) } : {}),
  };
}

async function removeUserImages(userId: string): Promise<boolean> {
  try {
    const storage = createAdminClient().storage.from(IMAGE_BUCKET);
    const folders = [`${userId}/avatars`, `${userId}/intake`];
    const paths: string[] = [];
    for (const folder of folders) {
      const { data, error } = await storage.list(folder, { limit: 1000 });
      if (error) throw error;
      for (const file of data ?? []) {
        if (file.id) paths.push(`${folder}/${file.name}`);
      }
    }
    if (paths.length === 0) return true;
    const { error: removeError } = await storage.remove(paths);
    if (removeError) throw removeError;
    return true;
  } catch (err) {
    console.warn("[/api/admin/citizens/delete] storage cleanup failed", err);
    return false;
  }
}

export async function GET(request: NextRequest) {
  const { supabase } = await getRouteAuth(request);
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const rl = await checkRateLimit(`admin-citizen-delete-preview:${guard.user.id}`, RATE_LIMITS.read);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
    );
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !isValidUUID(id)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const { data, error } = await supabase.rpc(RPC, { _user_id: id, _apply: false, _confirm: null });
  if (isNotAdmin(error)) return NextResponse.json({ error: "not_admin", message: "Forbidden" }, { status: 403 });
  if (error) {
    console.error("[/api/admin/citizens/delete] preview rpc", error);
    return NextResponse.json({ error: "preview_failed" }, { status: 500 });
  }
  const result = (data ?? {}) as RpcResult;
  if (!result.success) return refusal(result);
  return NextResponse.json(publicPreflight(result));
}

export async function POST(request: NextRequest) {
  const { supabase } = await getRouteAuth(request);
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const rl = await checkRateLimit(`admin-citizen-delete:${guard.user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
    );
  }

  let payload: { id?: unknown; confirmName?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof payload.id === "string" ? payload.id : "";
  const confirmName = typeof payload.confirmName === "string" ? payload.confirmName : "";
  if (!isValidUUID(id) || confirmName.length > MAX_CONFIRM_NAME) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc(RPC, { _user_id: id, _apply: true, _confirm: confirmName });
  if (isNotAdmin(error)) return NextResponse.json({ error: "not_admin", message: "Forbidden" }, { status: 403 });
  if (error) {
    console.error("[/api/admin/citizens/delete] rpc", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  const result = (data ?? {}) as RpcResult;
  if (!result.success || result.outcome !== "deleted") return refusal(result);

  const warnings: string[] = [];
  if (!(await removeUserImages(id))) {
    warnings.push("Their uploaded images couldn't be cleaned up. They're no longer linked to an account.");
  }

  return NextResponse.json({ outcome: "deleted", warnings });
}
