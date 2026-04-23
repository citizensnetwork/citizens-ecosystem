/**
 * Admin-only tag moderation.
 *
 * PATCH /api/admin/tags/[id]   body: { is_hidden?: boolean, is_official?: boolean }
 *
 * Assignments are intentionally NOT cascaded when a tag is hidden — we
 * preserve the audit trail of who used the tag before moderation.  The
 * public `GET /api/tags` filters hidden tags so the moderation action
 * is fully visible to end users without data loss.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { isValidUUID } from "@/lib/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import type { EventTag } from "@/types/db";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id: tagId } = await params;
  const supabase = await createClient();

  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  if (!isValidUUID(tagId)) {
    return NextResponse.json({ error: "Invalid tag id" }, { status: 400 });
  }

  const rl = checkRateLimit(`admin-tags:${guard.user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) },
      }
    );
  }

  let body: { is_hidden?: unknown; is_official?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const patch: Partial<Pick<EventTag, "is_hidden" | "is_official">> = {};
  if (typeof body.is_hidden === "boolean") patch.is_hidden = body.is_hidden;
  if (typeof body.is_official === "boolean") patch.is_official = body.is_official;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("event_tags")
    .update(patch)
    .eq("id", tagId)
    .select("id, slug, label, is_official, is_hidden, usage_count, created_by, created_at")
    .single();

  if (error || !data) {
    console.error("[API admin/tags PATCH]", error);
    return NextResponse.json(
      { error: "Failed to update tag" },
      { status: 500 }
    );
  }

  await logAdminAction(supabase, {
    actorId: guard.user.id,
    action: "tag.update",
    targetType: "event_tag",
    targetId: tagId,
    metadata: patch,
  });

  return NextResponse.json({ tag: data as EventTag });
}
