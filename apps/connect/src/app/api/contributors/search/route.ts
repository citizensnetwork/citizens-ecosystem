/**
 * GET /api/contributors/search
 * ----------------------------------------------------------------
 * Typo-tolerant ("30% mistake range") search over approved
 * Contributors. Powers the Organisations tab of the bottom search bar
 * on the events map.
 *
 * Query params (all optional):
 *   q         free-text query (max 100 chars)
 *   kinds     comma-separated subset of ministry|organization|business
 *   location  ILIKE substring on physical_address (max 100 chars)
 *   category  EventCategory slug — filters to orgs that have run at least one event in that category
 *   sort      "auto" | "followers" | "similarity"  (default auto)
 *   limit     1..50, default 25
 *
 * Uses the SECURITY INVOKER RPC `public.search_contributors` which
 * already restricts to approved contributors with a slug.
 *
 * Anonymous reads are allowed (the contributor directory is public);
 * we still rate-limit by IP to prevent abuse.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lazy singleton anon Supabase client. The contributor directory is
// fully public, so we deliberately skip the cookie-bound SSR client
// here: that client always emits `Set-Cookie` for the refresh-token
// rotation which would prevent shared / CDN caching of these
// responses. A bare anon client keeps responses cacheable.
let anonClient: SupabaseClient | null = null;
function getAnonClient(): SupabaseClient {
  if (anonClient) return anonClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must be set",
    );
  }
  anonClient = createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { "X-Client-Info": "citizens-connect/api/contributors-search" } },
  });
  return anonClient;
}

const ALLOWED_KINDS = ["ministry", "organization", "business"] as const;
type Kind = (typeof ALLOWED_KINDS)[number];

const ALLOWED_SORTS = ["auto", "followers", "similarity"] as const;
type Sort = (typeof ALLOWED_SORTS)[number];

const MAX_Q = 100;
const MAX_LOC = 100;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

function clampLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, n));
}

function parseKinds(raw: string | null): Kind[] | null {
  if (!raw) return null;
  const out: Kind[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if ((ALLOWED_KINDS as readonly string[]).includes(trimmed)) {
      out.push(trimmed as Kind);
    }
  }
  return out.length === 0 ? null : out;
}

function clientId(request: NextRequest): string {
  const fwd =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "anon";
  return fwd.split(",")[0]!.trim().slice(0, 64) || "anon";
}

export async function GET(request: NextRequest) {
  const ip = clientId(request);
  const rl = checkRateLimit(`org-search:${ip}`, RATE_LIMITS.read);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_Q);
  const kinds = parseKinds(url.searchParams.get("kinds"));
  const location = (url.searchParams.get("location") ?? "")
    .trim()
    .slice(0, MAX_LOC);
  const category = (url.searchParams.get("category") ?? "").trim().slice(0, 60);
  const sortRaw = (url.searchParams.get("sort") ?? "auto").trim();
  const sort: Sort = (ALLOWED_SORTS as readonly string[]).includes(sortRaw)
    ? (sortRaw as Sort)
    : "auto";
  const limit = clampLimit(url.searchParams.get("limit"));

  const supabase = getAnonClient();
  const { data, error } = await supabase.rpc("search_contributors", {
    q,
    kinds,
    location_query: location.length > 0 ? location : null,
    category_slug: category.length > 0 ? category : null,
    sort_by: sort,
    result_limit: limit,
  });

  if (error) {
    console.error("[api/contributors/search]", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  return NextResponse.json(
    { data: data ?? [], meta: { limit, q, sort } },
    {
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
      },
    },
  );
}
