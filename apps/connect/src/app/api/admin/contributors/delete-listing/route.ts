/**
 * Admin → Listings "Delete".
 *
 *   GET  /api/admin/contributors/delete-listing?id=<uuid>
 *        Read-only preflight for the confirm modal: which of the two outcomes
 *        will happen, what it touches, and anything that forbids it.
 *   POST /api/admin/contributors/delete-listing   { id, confirmName }
 *        Does it. `confirmName` must equal the listing's name.
 *
 * (Not `/contributors/delete`: that route already exists and discards
 * contributor *applications*.)
 *
 * A Contributor listing IS a user account, so "delete" means one of two things,
 * and the DATABASE decides which from one fact — has the owner ever signed in?
 * (`admin_remove_contributor_listing`, migration 178; never the client):
 *   deleted  The owner never signed in: a Form-intake / admin-created
 *            placeholder. The auth user is hard-deleted and everything attached
 *            cascades with it.
 *   removed  The owner has signed in: a real person. Only the LISTING goes —
 *            role back to citizen, listing fields cleared, events/places
 *            cancelled, news posts and team removed — and they can re-apply.
 * It refuses admins, the caller, non-listings, and anyone who owns a Wear brand
 * or has Vision data. The check, the change and the audit row are one
 * transaction inside that function, so there is no half-removed listing and no
 * "owner signed in mid-delete" race.
 *
 * Auth: Bearer via getRouteAuth(), then requireAdmin(). The RPC runs on the
 * ADMIN'S OWN session (its admin guard keys on auth.uid()); service_role is used
 * only for the Storage cleanup, which Postgres cannot do.
 */

import { getRouteAuth } from "@/lib/supabase/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC = "admin_remove_contributor_listing";
/** Form-intake logos/covers live under `<user-id>/intake/` (see /api/intake/google-form). */
const IMAGE_BUCKET = "event-images";
const MAX_CONFIRM_NAME = 200;

type RpcResult = {
  success?: boolean;
  reason?: string;
  blockers?: string[];
  case?: "placeholder" | "account";
  outcome?: "deleted" | "removed";
  name?: string | null;
  slug?: string | null;
  events?: number;
  places?: number;
  news_posts?: number;
  team_members?: number;
  moved_placeholder?: boolean;
};

const BLOCKER_TEXT: Record<string, string> = {
  owns_wear_brand: "owns a Citizens Wear brand",
  created_vision_organisation: "created an organisation in Citizens Vision",
  has_vision_activity: "has activity in Citizens Vision",
};

/** The reason codes the function can refuse with → an HTTP status and a plain sentence. */
const REFUSALS: Record<string, { status: number; message: string }> = {
  not_admin: { status: 403, message: "Forbidden" },
  not_found: { status: 404, message: "That listing no longer exists." },
  cannot_delete_self: { status: 409, message: "You can't delete your own account." },
  target_is_admin: { status: 409, message: "That account is an admin, so it can't be deleted or demoted here." },
  not_a_listing: { status: 409, message: "That account isn't a Contributor listing." },
  name_mismatch: { status: 400, message: "The name you typed doesn't match this listing." },
  blocked_by_related_data: {
    status: 409,
    message: "Other data in Citizens still depends on this account, so it can't be deleted. Hide the listing instead.",
  },
  signed_in_meanwhile: {
    status: 409,
    message: "The owner signed in a moment ago, so this is no longer an empty placeholder. Reopen Delete to see what will happen now.",
  },
};

function blockedMessage(blockers: string[]): string {
  const reasons = blockers.map((b) => BLOCKER_TEXT[b] ?? "has linked data elsewhere in Citizens");
  return `This account ${reasons.join(" and ")}, so it can't be deleted or demoted here. Hide the listing instead, or clear that first.`;
}

function refusal(result: RpcResult) {
  if (result.reason === "blocked") {
    const blockers = result.blockers ?? [];
    return NextResponse.json({ error: "blocked", blockers, message: blockedMessage(blockers) }, { status: 409 });
  }
  const known = result.reason ? REFUSALS[result.reason] : undefined;
  if (known) return NextResponse.json({ error: result.reason, message: known.message }, { status: known.status });
  return NextResponse.json({ error: "delete_failed" }, { status: 500 });
}

/**
 * Best-effort: the intake logo/cover files of a listing that no longer exists.
 * A failure must never fail the request (the database change already
 * committed) — it only becomes a warning. Returns whether it all worked.
 */
async function removeIntakeImages(userId: string): Promise<boolean> {
  try {
    const folder = `${userId}/intake`;
    const storage = createAdminClient().storage.from(IMAGE_BUCKET);
    const { data, error } = await storage.list(folder, { limit: 1000 });
    if (error) throw error;
    // Sub-folders come back with a null id; only files are removed.
    const paths = (data ?? []).filter((f) => f.id).map((f) => `${folder}/${f.name}`);
    if (paths.length === 0) return true;
    const { error: removeError } = await storage.remove(paths);
    if (removeError) throw removeError;
    return true;
  } catch (err) {
    console.warn("[/api/admin/contributors/delete-listing] storage cleanup failed", err);
    return false;
  }
}

export async function GET(request: NextRequest) {
  const { supabase } = await getRouteAuth(request);
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const rl = await checkRateLimit(`admin-listing-delete-preview:${guard.user.id}`, RATE_LIMITS.read);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
    );
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !isValidUUID(id)) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const { data, error } = await supabase.rpc(RPC, { _user_id: id, _apply: false, _confirm_name: null });
  if (error) {
    console.error("[/api/admin/contributors/delete-listing] preview rpc", error);
    return NextResponse.json({ error: "preview_failed" }, { status: 500 });
  }
  const result = (data ?? {}) as RpcResult;
  if (!result.success) return refusal(result);

  const blockers = result.blockers ?? [];
  return NextResponse.json({
    case: result.case,
    name: result.name ?? "",
    slug: result.slug ?? null,
    eventsAffected: result.events ?? 0,
    placesAffected: result.places ?? 0,
    newsPosts: result.news_posts ?? 0,
    teamMembers: result.team_members ?? 0,
    movedPlaceholder: result.moved_placeholder === true,
    blockers,
    ...(blockers.length > 0 ? { message: blockedMessage(blockers) } : {}),
  });
}

export async function POST(request: NextRequest) {
  const { supabase } = await getRouteAuth(request);
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const rl = await checkRateLimit(`admin-listing-delete:${guard.user.id}`, RATE_LIMITS.mutation);
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

  // The function re-checks everything itself (admin, target, blockers, the
  // typed name) — nothing the client says is trusted.
  const { data, error } = await supabase.rpc(RPC, { _user_id: id, _apply: true, _confirm_name: confirmName });
  if (error) {
    console.error("[/api/admin/contributors/delete-listing] rpc", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  const result = (data ?? {}) as RpcResult;
  if (!result.success || !result.outcome) return refusal(result);

  const warnings: string[] = [];
  // A placeholder whose listing was claimed from another account: its logo and
  // cover were copied onto the claimant by URL, so the files are theirs now.
  if (!result.moved_placeholder && !(await removeIntakeImages(id))) {
    warnings.push("Its uploaded images couldn't be cleaned up. They're no longer linked to anything.");
  }

  return NextResponse.json({
    outcome: result.outcome,
    eventsAffected: result.events ?? 0,
    placesAffected: result.places ?? 0,
    warnings,
  });
}
