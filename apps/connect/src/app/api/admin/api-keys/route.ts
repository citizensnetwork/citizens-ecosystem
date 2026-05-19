/**
 * POST /api/admin/api-keys       — mint a new API key (admin-only)
 * GET  /api/admin/api-keys       — list all keys (admin-only)
 * DELETE /api/admin/api-keys?id= — soft-revoke a key (admin-only)
 *
 * The raw key is returned ONCE on POST and never persisted anywhere
 * outside the caller's response. Subsequent GETs show only the prefix.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SCOPES = 10;
const SCOPE_PATTERN = /^[a-z0-9:_\-]{1,40}$/;
const MAX_NAME = 80;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_CAP = 200;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  // Light read cap — defence-in-depth for admin session compromise.
  // Listing keys is a read; mutation tier was needlessly tight (Tier-B
  // audit follow-up — `read` matches the rest of admin list endpoints).
  const rl = checkRateLimit(`admin-keys-list:${guard.user.id}`, RATE_LIMITS.read);
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
  const includeDisabled = url.searchParams.get("include_disabled") === "1";

  let query = supabase
    .from("api_keys")
    .select(
      "id, name, key_prefix, scopes, rate_limit_per_minute, owner_id, last_used_at, disabled_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(LIST_CAP);
  if (!includeDisabled) query = query.is("disabled_at", null);

  const { data, error } = await query;
  if (error) {
    console.error("[admin/api-keys GET]", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  const rows = data ?? [];
  return NextResponse.json({
    data: rows,
    // Surface truncation so the UI can warn the admin rather than
    // silently hiding oldest keys (Architect audit L4).
    meta: { truncated: rows.length >= LIST_CAP },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const rl = checkRateLimit(`admin-keys-mint:${guard.user.id}`, RATE_LIMITS.heavy);
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
    owner_email?: string;
    owner_id?: string;
    name?: string;
    rate_limit_per_minute?: number | null;
    scopes?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name || name.length > MAX_NAME) {
    return NextResponse.json(
      { error: `Name is required (max ${MAX_NAME} chars).` },
      { status: 400 },
    );
  }

  const scopes = Array.isArray(body.scopes) && body.scopes.length > 0
    ? body.scopes
    : ["read:public"];
  if (scopes.length > MAX_SCOPES || !scopes.every((s) => typeof s === "string" && SCOPE_PATTERN.test(s))) {
    return NextResponse.json({ error: "Invalid scopes." }, { status: 400 });
  }

  let rateLimit: number | null = null;
  if (body.rate_limit_per_minute !== undefined && body.rate_limit_per_minute !== null) {
    const n = Number(body.rate_limit_per_minute);
    if (!Number.isFinite(n) || n < 1 || n > 10_000) {
      return NextResponse.json(
        { error: "rate_limit_per_minute must be between 1 and 10000." },
        { status: 400 },
      );
    }
    rateLimit = Math.floor(n);
  }

  // Resolve owner by email or by id. Owner must exist and be an
  // approved contributor OR an admin.
  let ownerId = body.owner_id ?? "";
  if (ownerId && !UUID_RE.test(ownerId)) {
    // Defence-in-depth — don't rely on the RPC to validate UUID shape
    // (Architect audit L2).
    return NextResponse.json(
      { error: "owner_id must be a UUID." },
      { status: 400 },
    );
  }
  if (!ownerId && body.owner_email) {
    const { data: owner } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", body.owner_email.trim().toLowerCase())
      .maybeSingle();
    if (!owner) {
      return NextResponse.json(
        { error: "No profile with that email." },
        { status: 404 },
      );
    }
    ownerId = owner.id;
  }
  if (!ownerId) {
    return NextResponse.json(
      { error: "owner_email or owner_id is required." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("create_api_key", {
    p_owner_id: ownerId,
    p_name: name,
    p_rate_limit_per_minute: rateLimit,
    p_scopes: scopes,
  });
  if (error) {
    console.error("[admin/api-keys POST]", error);
    // Switch on the known error code first; only fall back to the
    // message regex if no code is present. This avoids reflecting
    // RPC internals to the client when the message shape changes.
    // (Architect audit L7.)
    const code = (error as { code?: string }).code;
    const msg = error.message ?? "Failed to create key";
    const isUserError =
      code === "P0001" /* raise */ ||
      (!code && /Not (auth|authoris)|required|approved/i.test(msg));
    return NextResponse.json(
      { error: isUserError ? msg : "Failed to create key" },
      { status: isUserError ? 400 : 500 },
    );
  }

  const result = data as {
    id: string;
    raw_key: string;
    prefix: string;
    name: string;
  };

  await logAdminAction(supabase, {
    actorId: guard.user.id,
    action: "api_key.mint",
    targetType: "api_key",
    targetId: result.id,
    metadata: { owner_id: ownerId, name, rate_limit_per_minute: rateLimit, scopes },
  });

  return NextResponse.json(result, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const rl = checkRateLimit(
    `admin-keys-revoke:${guard.user.id}`,
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

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  if (!UUID_RE.test(id)) {
    // Reject obvious junk before round-tripping to the RPC. The RPC
    // will also fail, but a 400 here is clearer + cheaper.
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("revoke_api_key", {
    p_key_id: id,
  });
  if (error) {
    console.error("[admin/api-keys DELETE]", error);
    return NextResponse.json({ error: "Failed to revoke key" }, { status: 500 });
  }

  await logAdminAction(supabase, {
    actorId: guard.user.id,
    action: "api_key.revoke",
    targetType: "api_key",
    targetId: id,
    metadata: { success: Boolean(data) },
  });

  return NextResponse.json({ success: Boolean(data) });
}
