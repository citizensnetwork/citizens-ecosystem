/**
 * GET /api/v1/contributors
 * ----------------------------------------------------------------
 * Public, read-only directory of approved Contributors — the
 * "centralized contributor registry" surface for the Citizens
 * ecosystem. Citizens Central and other Citizens channels can poll
 * this endpoint to populate their own directories.
 *
 * Query params (all optional):
 *   kind     - filter by contributor_kind (ministry|organization|business)
 *   q        - case-insensitive substring match on full_name / bio
 *   limit    - 1..100, default 50
 *   offset   - default 0
 *
 * Response envelope:
 *   { data: Contributor[], meta: { count, limit, offset } }
 *
 * RLS on `profiles` already permits public SELECT; this endpoint is
 * intentionally unauthenticated. Rate-limited by IP to prevent abuse.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const RL = { limit: 60, windowMs: 60_000 } as const;

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function clampInt(raw: string | null, def: number, min: number, max: number) {
  if (!raw) return def;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`v1-contributors:ip:${ip}`, RL);
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
  const kindParam = url.searchParams.get("kind");
  const kind =
    kindParam === "ministry" ||
    kindParam === "organization" ||
    kindParam === "business"
      ? kindParam
      : null;
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const limit = clampInt(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 10_000);

  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select(
      [
        "id",
        "full_name",
        "role",
        "contributor_kind",
        "contributor_slug",
        "bio",
        "avatar_url",
        "logo_url",
        "website_url",
        "instagram_handle",
        "facebook_url",
        "tiktok_handle",
        "youtube_url",
        "physical_address",
        "physical_latitude",
        "physical_longitude",
        "created_at",
      ].join(","),
      { count: "exact" },
    )
    .eq("role", "contributor")
    .eq("contributor_status", "approved");

  if (kind) query = query.eq("contributor_kind", kind);
  if (q) {
    // escape % and , for Postgres ilike + supabase or()
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(`full_name.ilike.%${safe}%,bio.ilike.%${safe}%`);
  }

  const { data, error, count } = await query
    .order("full_name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { error: "Failed to list contributors" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      data: data ?? [],
      meta: {
        count: count ?? 0,
        limit,
        offset,
      },
    },
    {
      headers: {
        // short cache so the central directory stays fresh but we don't
        // hammer the DB on every poll.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
