/**
 * POST /api/preferences
 *
 * Merges a partial preferences payload into `profiles.preferences` for the
 * current user.  We use a partial merge (rather than overwrite) so different
 * surfaces — Easter-egg orchestrator, Would You Rather, future settings
 * panels — can write their slice without clobbering each other.
 *
 * Body shape (all keys optional):
 *   {
 *     wyr?:  Record<string, "left"|"right">,
 *     tags?: Record<string, { value, answered_at, expires_at }>,
 *     leadership_interest?: boolean | null,
 *     last_longform_asked_at?: string | null,
 *     ...other slices          // forwarded verbatim
 *   }
 *
 * Notes:
 *   - We treat `preferences` as a free-form bag.  Validation is intentionally
 *     light: we only enforce shape on the `wyr` and `tags` slices so a
 *     hostile client can't poison the bag with deeply nested arbitrary data.
 *   - Merge happens server-side via a single SELECT-then-UPDATE so we can
 *     deep-merge by key (per-question keys under `wyr`, per-tag keys under
 *     `tags`) without losing earlier answers when a user re-runs a prompt.
 */

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { computeInterestPercentages } from "@/lib/personalization/percentages";
import type { Preferences, PreferenceTag } from "@/types/db";

type WyrAnswer = "left" | "right";

type PreferenceTagInput = {
  value: unknown;
  answered_at: string;
  expires_at: string | null;
};

function isPreferenceTag(x: unknown): x is PreferenceTagInput {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const r = x as Record<string, unknown>;
  if (typeof r.answered_at !== "string") return false;
  if (r.expires_at !== null && typeof r.expires_at !== "string") return false;
  return "value" in r;
}

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

  // Normalise the tags slice: drop any entry that doesn't match the
  // PreferenceTag contract.  Keys are free-form tag slugs.
  let cleanTags: Record<string, PreferenceTagInput> | undefined;
  if (payload.tags !== undefined) {
    if (
      payload.tags === null ||
      typeof payload.tags !== "object" ||
      Array.isArray(payload.tags)
    ) {
      return NextResponse.json({ error: "tags must be an object" }, { status: 400 });
    }
    cleanTags = {};
    for (const [k, v] of Object.entries(payload.tags as Record<string, unknown>)) {
      if (isPreferenceTag(v)) cleanTags[k] = v;
    }
  }

  // Read existing preferences + demographic columns so we can deep-merge and
  // recompute the cached percentages in a single round-trip.
  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select(
      "preferences, gender, age_range, relationship_status, stage_of_life, energy_level",
    )
    .eq("id", user.id)
    .single();
  if (readError) {
    console.error("[API preferences] read", readError);
    return NextResponse.json({ error: "Could not read preferences" }, { status: 500 });
  }

  const current = (existing?.preferences ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...current };

  // Deep-merge the wyr slice (per-question keys).
  if (cleanWyr) {
    const existingWyr = (current.wyr ?? {}) as Record<string, WyrAnswer>;
    next.wyr = { ...existingWyr, ...cleanWyr };
  }

  // Deep-merge the tags slice (per-tag-slug keys).
  if (cleanTags) {
    const existingTags = (current.tags ?? {}) as Record<string, PreferenceTagInput>;
    next.tags = { ...existingTags, ...cleanTags };
  }

  // Forward any other top-level keys verbatim — future-proofing for new slices
  // (e.g. preferred_view, custom_panel_order) without code changes here.
  for (const [k, v] of Object.entries(payload)) {
    if (k === "wyr" || k === "tags") continue;
    next[k] = v;
  }

  // Recompute the cached percentages from the merged state.  Doing this
  // server-side (rather than client-side before POST) guarantees every
  // surface sees the same snapshot and prevents tampering.
  const prefsForCompute: Pick<Preferences, "wyr" | "tags"> = {
    wyr: (next.wyr ?? undefined) as Preferences["wyr"],
    tags: (next.tags ?? undefined) as Record<string, PreferenceTag> | undefined,
  };
  next.percentages = computeInterestPercentages({
    gender: existing?.gender ?? null,
    age_range: existing?.age_range ?? null,
    relationship_status: existing?.relationship_status ?? null,
    stage_of_life: existing?.stage_of_life ?? null,
    energy_level: existing?.energy_level ?? null,
    preferences: prefsForCompute,
  });

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
