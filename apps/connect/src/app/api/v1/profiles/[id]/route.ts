/**
 * GET /api/v1/profiles/[id]
 * ----------------------------------------------------------------
 * Minimal, display-safe public identity for a single user by id.
 *
 * Purpose: the cross-app contract path for a sibling app (Citizens Wear)
 * to render the display identity of a Connect user it hasn't seen sign
 * in yet — the rare "backfill" case its `wear.users` mirror can't cover
 * from the user's own session. See docs/strategy/STEP3_WEAR_INTEGRATION_SCOPE.md
 * §5 Q1 and docs/SHARED_DB_CONTRACT.md R2 (siblings read the commons via
 * /api/v1, never raw `public.*` tables).
 *
 * Returns ONLY display-safe fields (id, full_name, avatar_url). The
 * `profiles` RLS policy "Profiles are viewable by everyone" grants
 * row-level SELECT to anon, so column safety is enforced here by the
 * explicit `select(...)` list — never widen it to email / address /
 * contributor internals without a contract review.
 *
 * 404 when the id does not resolve to a profile.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateV1 } from "@/lib/v1Gate";
import { isValidUUID } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const gate = await gateV1(request, {
    bucket: "v1-profile",
    resourceId: id,
  });
  if (gate.deny) return gate.deny;

  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    // Display-safe fields ONLY — do not widen (see file header).
    .select("id,full_name,avatar_url")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 },
    );
  }
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      data: profile,
      // `generated_at` lives in a header so the body stays byte-stable and
      // CDN caching actually dedupes (matches /api/v1/events/{id}).
      meta: {},
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        "X-Generated-At": new Date().toISOString(),
      },
    },
  );
}
