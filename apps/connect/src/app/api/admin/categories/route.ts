/**
 * POST /api/admin/categories — create a category (admin-only)
 *
 * Replaces the previous pattern where `CategoryManager` wrote to the
 * `categories` table directly via PostgREST. Centralising through this
 * route gives us:
 *
 *   - one place to validate `name`, `slug`, `applies_to`, `sort_order`
 *   - guaranteed `admin_actions` audit row per write
 *   - rate-limit defence-in-depth in case an admin session is compromised
 *
 * RLS still enforces the admin check on the underlying table; this route
 * is the user-facing API and rejects non-admins early via `requireAdmin`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NAME = 80;
const MAX_SLUG = 80;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_APPLIES_TO = ["events", "places", "both"] as const;
type AppliesTo = (typeof ALLOWED_APPLIES_TO)[number];

interface CategoryCreateInput {
  name?: unknown;
  slug?: unknown;
  applies_to?: unknown;
  sort_order?: unknown;
  emoji?: unknown;
  color?: unknown;
}

function validateCreate(body: CategoryCreateInput):
  | {
      ok: true;
      value: {
        name: string;
        slug: string;
        applies_to: AppliesTo;
        sort_order: number;
        emoji: string;
        color: string;
      };
    }
  | { ok: false; error: string } {
  if (typeof body.name !== "string") {
    return { ok: false, error: "Name is required." };
  }
  const name = body.name.trim();
  if (!name || name.length > MAX_NAME) {
    return { ok: false, error: `Name must be 1–${MAX_NAME} characters.` };
  }

  if (typeof body.slug !== "string") {
    return { ok: false, error: "Slug is required." };
  }
  const slug = body.slug.trim().toLowerCase();
  if (!slug || slug.length > MAX_SLUG || !SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      error: "Slug must be 1–80 lowercase letters, numbers, and hyphens.",
    };
  }

  if (
    typeof body.applies_to !== "string" ||
    !ALLOWED_APPLIES_TO.includes(body.applies_to as AppliesTo)
  ) {
    return {
      ok: false,
      error: "applies_to must be events, places, or both.",
    };
  }

  const sortRaw = Number(body.sort_order ?? 0);
  if (!Number.isFinite(sortRaw) || sortRaw < 0 || sortRaw > 10_000) {
    return { ok: false, error: "sort_order must be between 0 and 10000." };
  }

  const emoji =
    typeof body.emoji === "string" ? body.emoji.slice(0, 8) : "";
  const color =
    typeof body.color === "string" && /^#[0-9a-f]{3,8}$/i.test(body.color)
      ? body.color
      : "#6b7280";

  return {
    ok: true,
    value: {
      name,
      slug,
      applies_to: body.applies_to as AppliesTo,
      sort_order: Math.floor(sortRaw),
      emoji,
      color,
    },
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const rl = checkRateLimit(
    `admin-categories-post:${guard.user.id}`,
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

  let body: CategoryCreateInput;
  try {
    body = (await request.json()) as CategoryCreateInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = validateCreate(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("categories")
    .insert(parsed.value)
    .select()
    .single();

  if (error) {
    // 23505 = unique_violation (duplicate slug) — surface that as 409
    // so the UI can hint "slug already exists".
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json(
        { error: "A category with that slug already exists." },
        { status: 409 },
      );
    }
    console.error("[admin/categories POST]", error);
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 },
    );
  }

  await logAdminAction(supabase, {
    actorId: guard.user.id,
    action: "category.create",
    targetType: "category",
    targetId: data.id,
    metadata: {
      slug: parsed.value.slug,
      applies_to: parsed.value.applies_to,
    },
  });

  return NextResponse.json({ category: data }, { status: 201 });
}
