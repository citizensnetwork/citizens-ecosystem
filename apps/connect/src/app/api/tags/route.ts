/**
 * Tags API — typeahead search and user-created tag proposals.
 *
 * GET  /api/tags?q=<prefix>&limit=<n>  — public search, excludes hidden.
 * POST /api/tags                       — authenticated, rate-limited.
 *
 * The POST is idempotent on slug conflict: if a tag with the derived slug
 * already exists and is visible, we return it so the caller can assign it
 * to the event without a double round-trip.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidTagLabel, slugifyTag, TAG_LABEL_MAX } from "@/lib/validation";
import type { EventTag } from "@/types/db";

const MAX_SEARCH_LIMIT = 25;

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "10", 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_SEARCH_LIMIT)
    : 10;

  // RLS filters hidden tags for non-admin callers; we additionally
  // enforce is_hidden = false so admins don't accidentally get
  // moderation-flagged results on this public endpoint.
  let query = supabase
    .from("event_tags")
    .select("id, slug, label, is_official, is_hidden, usage_count, created_by, created_at")
    .eq("is_hidden", false)
    .order("usage_count", { ascending: false })
    .order("label", { ascending: true })
    .limit(limit);

  if (q.length > 0) {
    // Case-insensitive prefix match on label. Using `ilike` with escaped
    // `%` guards against wildcard injection in user input.
    const escaped = q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    query = query.ilike("label", `${escaped}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[API tags GET]", error);
    return NextResponse.json(
      { error: "Failed to load tags" },
      { status: 500 }
    );
  }

  return NextResponse.json({ tags: (data ?? []) as EventTag[] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`tags:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) },
      }
    );
  }

  let body: { label?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!isValidTagLabel(body.label)) {
    return NextResponse.json(
      { error: `Tag label must be between 1 and ${TAG_LABEL_MAX} characters` },
      { status: 400 }
    );
  }

  const label = (body.label as string).trim();
  const slug = slugifyTag(label);
  if (!slug) {
    return NextResponse.json(
      { error: "Tag must contain at least one alphanumeric character" },
      { status: 400 }
    );
  }

  // Look up existing visible tag first (idempotent create).
  const { data: existing } = await supabase
    .from("event_tags")
    .select("id, slug, label, is_official, is_hidden, usage_count, created_by, created_at")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    if ((existing as EventTag).is_hidden) {
      return NextResponse.json(
        { error: "Tag is not available" },
        { status: 409 }
      );
    }
    return NextResponse.json({ tag: existing as EventTag });
  }

  const { data: created, error } = await supabase
    .from("event_tags")
    .insert({
      slug,
      label,
      created_by: user.id,
    })
    .select("id, slug, label, is_official, is_hidden, usage_count, created_by, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Lost the race with a concurrent insert — fetch and return.
      const { data: raced } = await supabase
        .from("event_tags")
        .select("id, slug, label, is_official, is_hidden, usage_count, created_by, created_at")
        .eq("slug", slug)
        .maybeSingle();
      if (raced) return NextResponse.json({ tag: raced as EventTag });
    }
    console.error("[API tags POST]", error);
    return NextResponse.json(
      { error: "Failed to create tag" },
      { status: 500 }
    );
  }

  return NextResponse.json({ tag: created as EventTag }, { status: 201 });
}
