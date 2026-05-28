/**
 * POST /api/shares
 * ----------------------------------------------------------------
 * Body: { entity_type: "event" | "place" | "contributor"; entity_id: string }
 *
 * Source-of-truth producer for the "shares" analytics metric
 * (migration 116). Share surfaces (ShareButton / SocialShareButtons /
 * ConsiderBadge) fire this best-effort after a successful share/copy.
 *
 * Anonymous shares are allowed (share buttons live on public pages),
 * so authentication is optional — `user_id` is NULL when logged out.
 * Rate-limited by user id when present, else by client IP.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTITY_TYPES = ["event", "place", "contributor"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

type Body = {
  entity_type?: unknown;
  entity_id?: unknown;
};

/** Best-effort client IP for rate-limit keying on anonymous shares. */
function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const entityType = body.entity_type;
  const entityId = body.entity_id;

  if (
    typeof entityType !== "string" ||
    !ENTITY_TYPES.includes(entityType as EntityType)
  ) {
    return NextResponse.json({ error: "Invalid entity_type" }, { status: 400 });
  }
  if (typeof entityId !== "string" || !isValidUUID(entityId)) {
    return NextResponse.json({ error: "Invalid entity_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Rate-limit: prefer the authenticated user id, fall back to IP for anon.
  const rlKey = user ? `shares:user:${user.id}` : `shares:ip:${getClientIp(request)}`;
  const rl = checkRateLimit(rlKey, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { error } = await supabase.from("shares").insert({
    entity_type: entityType,
    entity_id: entityId,
    user_id: user?.id ?? null,
  });

  if (error) {
    // Don't surface internals; the client treats this as fire-and-forget.
    console.error("[API shares POST]", error);
    return NextResponse.json({ error: "Could not log share" }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
