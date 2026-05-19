/**
 * PATCH /api/admin/categories/[id]  — edit a category (admin-only)
 * DELETE /api/admin/categories/[id] — remove a category (admin-only)
 *
 * Mirrors the validation/audit/rate-limit posture of the POST route. The
 * DELETE handler relies on the DB's FK behaviour (`categories.category_id`
 * on `events`/`places` is nullable with `ON DELETE SET NULL`) — admins are
 * expected to know that deleting a category will detach existing rows.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME = 80;
const MAX_SLUG = 80;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_APPLIES_TO = ["events", "places", "both"] as const;
type AppliesTo = (typeof ALLOWED_APPLIES_TO)[number];

interface CategoryPatchInput {
  name?: unknown;
  slug?: unknown;
  applies_to?: unknown;
  sort_order?: unknown;
  emoji?: unknown;
  color?: unknown;
}

function validatePatch(
  body: CategoryPatchInput,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string } {
  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return { ok: false, error: "Invalid name." };
    }
    const name = body.name.trim();
    if (!name || name.length > MAX_NAME) {
      return { ok: false, error: `Name must be 1–${MAX_NAME} characters.` };
    }
    patch.name = name;
  }

  if (body.slug !== undefined) {
    if (typeof body.slug !== "string") {
      return { ok: false, error: "Invalid slug." };
    }
    const slug = body.slug.trim().toLowerCase();
    if (!slug || slug.length > MAX_SLUG || !SLUG_PATTERN.test(slug)) {
      return {
        ok: false,
        error: "Slug must be 1–80 lowercase letters, numbers, and hyphens.",
      };
    }
    patch.slug = slug;
  }

  if (body.applies_to !== undefined) {
    if (
      typeof body.applies_to !== "string" ||
      !ALLOWED_APPLIES_TO.includes(body.applies_to as AppliesTo)
    ) {
      return {
        ok: false,
        error: "applies_to must be events, places, or both.",
      };
    }
    patch.applies_to = body.applies_to;
  }

  if (body.sort_order !== undefined) {
    const sortRaw = Number(body.sort_order);
    if (!Number.isFinite(sortRaw) || sortRaw < 0 || sortRaw > 10_000) {
      return { ok: false, error: "sort_order must be between 0 and 10000." };
    }
    patch.sort_order = Math.floor(sortRaw);
  }

  if (body.emoji !== undefined) {
    if (typeof body.emoji !== "string") {
      return { ok: false, error: "Invalid emoji." };
    }
    patch.emoji = body.emoji.slice(0, 8);
  }

  if (body.color !== undefined) {
    if (
      typeof body.color !== "string" ||
      !/^#[0-9a-f]{3,8}$/i.test(body.color)
    ) {
      return { ok: false, error: "color must be a hex string." };
    }
    patch.color = body.color;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No fields to update." };
  }

  return { ok: true, value: patch };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const rl = checkRateLimit(
    `admin-categories-patch:${guard.user.id}`,
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

  let body: CategoryPatchInput;
  try {
    body = (await request.json()) as CategoryPatchInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = validatePatch(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("categories")
    .update(parsed.value)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json(
        { error: "A category with that slug already exists." },
        { status: 409 },
      );
    }
    console.error("[admin/categories PATCH]", error);
    return NextResponse.json(
      { error: "Failed to update category" },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await logAdminAction(supabase, {
    actorId: guard.user.id,
    action: "category.update",
    targetType: "category",
    targetId: id,
    metadata: { fields: Object.keys(parsed.value) },
  });

  return NextResponse.json({ category: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const rl = checkRateLimit(
    `admin-categories-delete:${guard.user.id}`,
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

  const { data, error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .select("id, slug")
    .maybeSingle();

  if (error) {
    console.error("[admin/categories DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete category" },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await logAdminAction(supabase, {
    actorId: guard.user.id,
    action: "category.delete",
    targetType: "category",
    targetId: id,
    metadata: { slug: data.slug },
  });

  return NextResponse.json({ success: true });
}
