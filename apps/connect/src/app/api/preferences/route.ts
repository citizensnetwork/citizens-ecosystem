/**
 * POST /api/preferences
 *
 * Merges a partial preferences payload into `profiles.preferences` for the
 * current user.  We use a partial merge (rather than overwrite) so different
 * surfaces — onboarding, Would You Rather, future settings panels — can write
 * their slice without clobbering each other.
 *
 * Body shape:
 *   { wyr?: Record<string, "left"|"right">, ...other slices }
 *
 * Notes:
 *   - We treat `preferences` as a free-form bag.  Validation is intentionally
 *     light: we only enforce that the payload is a plain object and that the
 *     special `wyr` slice (currently the only consumer) only contains the
 *     literal strings "left" or "right" so a hostile client can't poison the
 *     bag with arbitrary nested data.
 *   - Merge happens server-side via a single SELECT-then-UPDATE so we can
 *     deep-merge the `wyr` slice (per-question keys) without losing earlier
 *     answers when a user re-runs the picker.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type WyrAnswer = "left" | "right";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    } else {
      return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Normalise the wyr slice: drop any non-{left|right} value so a corrupt
  // entry can't end up persisted.  Empty/missing slice is fine (no-op).
  let cleanWyr: Record<string, WyrAnswer> | undefined;
  if (payload.wyr !== undefined) {
    if (
      payload.wyr === null ||
      typeof payload.wyr !== "object" ||
      Array.isArray(payload.wyr)
    ) {
      return NextResponse.json({ error: "wyr must be an object" }, { status: 400 });
    }
    cleanWyr = {};
    for (const [k, v] of Object.entries(payload.wyr as Record<string, unknown>)) {
      if (v === "left" || v === "right") cleanWyr[k] = v;
    }
  }

  // Read existing preferences so we can deep-merge the wyr slice.  This is
  // a single round-trip; concurrent writes are extremely unlikely on a
  // single-user-driven settings flow.
  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .single();
  if (readError) {
    console.error("[API preferences] read", readError);
    return NextResponse.json({ error: "Could not read preferences" }, { status: 500 });
  }

  const current = (existing?.preferences ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...current };

  // Only the wyr slice is currently structured; merge it deeply so we don't
  // lose answers from a prior session.
  if (cleanWyr) {
    const existingWyr = (current.wyr ?? {}) as Record<string, WyrAnswer>;
    next.wyr = { ...existingWyr, ...cleanWyr };
  }

  // Forward any other top-level keys verbatim — future-proofing for new slices
  // (e.g. preferred_view, custom_panel_order) without code changes here.
  for (const [k, v] of Object.entries(payload)) {
    if (k === "wyr") continue;
    next[k] = v;
  }

  const { error: writeError } = await supabase
    .from("profiles")
    .update({ preferences: next })
    .eq("id", user.id);
  if (writeError) {
    console.error("[API preferences] write", writeError);
    return NextResponse.json({ error: "Could not save preferences" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, preferences: next });
}
