import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const SUGGESTION_TITLE_MAX = 200;
const SUGGESTION_BODY_MAX = 2000;
const PAGE_URL_MAX = 500;
const SUGGESTIONS_PER_DAY = 10;

// Kingdom-Projects idea tiers (spec §4.2). Submitter picks the exact threshold
// within the tier's range; the two top tiers are fixed and non-negotiable.
const IDEA_TIERS: Record<string, { label: string; min: number; max: number; fixed?: number }> = {
  small_volunteer: { label: "Small Volunteer Project", min: 1, max: 20 },
  community: { label: "Community Project", min: 20, max: 100 },
  town: { label: "Town Project", min: 100, max: 1000 },
  funders_challenge: { label: "Funders Challenge", min: 5000, max: 5000, fixed: 5000 },
  provincial_vision: { label: "Provincial Vision", min: 10000, max: 10000, fixed: 10000 },
};
const CATEGORY_SLUG_RE = /^[a-z0-9-]{1,50}$/;

/** Sanitize: strip all control chars, allow printable Unicode only. */
function sanitizeText(raw: string): string {
  return raw
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .trim();
}

/** POST /api/suggestions — submit a platform suggestion or a community idea.
 *  Rate-limited 10/day/user. Idea submissions (tier present) additionally carry
 *  category/threshold/location and require an authenticated author (the
 *  submitter becomes the prospective project lead — spec §4.4). */
export async function POST(request: NextRequest) {
  const { supabase, user } = await getRouteAuth(request);

  // Apply rate limit keyed by user ID (authenticated) or IP (anonymous)
  const rateLimitKey = user
    ? `suggestions:user:${user.id}`
    : `suggestions:ip:${request.headers.get("x-forwarded-for") ?? "unknown"}`;

  const rl = checkRateLimit(rateLimitKey, {
    limit: SUGGESTIONS_PER_DAY,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Daily suggestion limit reached. Thank you for your feedback!" },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("title" in body) ||
    !("body" in body) ||
    !("page_url" in body)
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const titleRaw = typeof raw.title === "string" ? raw.title : "";
  const bodyRaw = typeof raw.body === "string" ? raw.body : "";
  const pageUrlRaw = typeof raw.page_url === "string" ? raw.page_url : "";

  const title = sanitizeText(titleRaw).slice(0, SUGGESTION_TITLE_MAX);
  const suggestion = sanitizeText(bodyRaw).slice(0, SUGGESTION_BODY_MAX);
  const pageUrl = sanitizeText(pageUrlRaw).slice(0, PAGE_URL_MAX);

  if (title.length < 3) {
    return NextResponse.json({ error: "Title must be at least 3 characters" }, { status: 400 });
  }
  if (suggestion.length < 10) {
    return NextResponse.json({ error: "Please provide more detail (min 10 characters)" }, { status: 400 });
  }
  if (pageUrl.length < 1) {
    return NextResponse.json({ error: "Page URL is required" }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(pageUrl)) {
    return NextResponse.json({ error: "Invalid page URL" }, { status: 400 });
  }

  const row: Record<string, unknown> = {
    user_id: user?.id ?? null,
    title,
    body: suggestion,
    page_url: pageUrl,
  };

  // ── Optional Kingdom-Projects idea fields ──────────────────────────────
  if (raw.tier !== undefined) {
    if (!user) {
      return NextResponse.json({ error: "Sign in to submit an Impact Idea" }, { status: 401 });
    }
    const tierKey = typeof raw.tier === "string" ? raw.tier : "";
    const tier = IDEA_TIERS[tierKey];
    if (!tier) {
      return NextResponse.json({ error: "Invalid idea tier" }, { status: 400 });
    }
    const requested = typeof raw.vote_threshold === "number" ? raw.vote_threshold : NaN;
    const threshold = tier.fixed ?? requested;
    if (!Number.isInteger(threshold) || threshold < tier.min || threshold > tier.max) {
      return NextResponse.json(
        { error: `Vote goal for ${tier.label} must be between ${tier.min} and ${tier.max}` },
        { status: 400 },
      );
    }
    row.tier = tierKey;
    row.tier_label = tier.label;
    row.vote_threshold = threshold;

    if (raw.category !== undefined) {
      const category = typeof raw.category === "string" ? raw.category : "";
      if (!CATEGORY_SLUG_RE.test(category)) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
      row.category = category;
    }

    const hasLat = raw.latitude !== undefined && raw.latitude !== null;
    const hasLng = raw.longitude !== undefined && raw.longitude !== null;
    if (hasLat !== hasLng) {
      return NextResponse.json({ error: "Provide both latitude and longitude, or neither" }, { status: 400 });
    }
    if (hasLat && hasLng) {
      const lat = typeof raw.latitude === "number" ? raw.latitude : NaN;
      const lng = typeof raw.longitude === "number" ? raw.longitude : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
      }
      row.latitude = lat;
      row.longitude = lng;
    }
  }

  // RETURNING runs under the SELECT policy (own rows only), so an anonymous
  // insert must not ask for the row back — RLS would reject the whole insert.
  if (user) {
    const { data, error } = await supabase
      .from("suggestions")
      .insert(row)
      .select("id")
      .single();
    if (error) {
      console.error("[API suggestions POST]", error);
      return NextResponse.json({ error: "Failed to submit suggestion" }, { status: 500 });
    }
    return NextResponse.json({ id: data.id }, { status: 201 });
  }

  const { error } = await supabase.from("suggestions").insert(row);
  if (error) {
    console.error("[API suggestions POST]", error);
    return NextResponse.json({ error: "Failed to submit suggestion" }, { status: 500 });
  }
  return NextResponse.json({ id: null }, { status: 201 });
}

/** GET /api/suggestions — admin-only: list all suggestions with filters. */
export async function GET(request: NextRequest) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = checkRateLimit(`suggestions:read:${user.id}`, RATE_LIMITS.read);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const VALID_STATUSES = ["open", "in_review", "actioned", "declined"] as const;
  const statusParam = searchParams.get("status");
  const status = VALID_STATUSES.includes(statusParam as (typeof VALID_STATUSES)[number])
    ? statusParam
    : null;

  let query = supabase
    .from("suggestions")
    .select("*, user:profiles!suggestions_user_id_fkey(full_name, avatar_url)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[API suggestions GET]", error);
    return NextResponse.json({ error: "Failed to fetch suggestions" }, { status: 500 });
  }

  return NextResponse.json({ suggestions: data ?? [] });
}
