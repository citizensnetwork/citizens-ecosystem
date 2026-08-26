/**
 * POST /api/contributor/profile
 *
 * Lets an approved Contributor update the public profile fields
 * specific to their role (bio, website, physical address, gallery,
 * etc.).  Regular profile fields (name, avatar, onboarding, …) still
 * go through their existing routes — this is additive.
 *
 * Authorisation: must be role='contributor' AND
 * contributor_status='approved'.  The RLS policy on `profiles`
 * already allows a user to update their own row; we gate here as
 * well so the UI surface stays clean.
 */

import { getRouteAuth } from "@/lib/supabase/route";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { normalisePublicUrl, normaliseSocialValue } from "@/lib/publicUrl";

const ALLOWED_KEYS = [
  "bio",
  "website_url",
  "instagram_handle",
  "facebook_url",
  "tiktok_handle",
  "youtube_url",
  "x_handle",
  "linkedin_url",
  "whatsapp_number",
  "physical_address",
  "physical_latitude",
  "physical_longitude",
  "contributor_no_fixed_location",
  "logo_url",
  "gallery_urls",
  "contributor_contact_email",
] as const;

type AllowedKey = (typeof ALLOWED_KEYS)[number];

const MAX_GALLERY_URLS = 6;
const MAX_URL_LENGTH = 2_000;
const MAX_BIO = 2_000;
const MAX_ADDRESS = 500;
const MAX_EMAIL = 254;
// Bounded quantifiers only — every segment has a fixed upper bound, so the
// state space is capped by the bounds themselves, not by input length.
// Length is also checked BEFORE this regex ever runs (defense in depth,
// same recipe as /api/admin/contributors/create).
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]{1,24}$/;

// Every social column, whatever its name suggests about its shape. The
// contributor typing into the form does not know which of these the schema
// calls a "_url" and which it calls a "_handle" — and they should not have to.
const SOCIAL_KEYS = [
  "instagram_handle",
  "facebook_url",
  "tiktok_handle",
  "youtube_url",
  "x_handle",
  "linkedin_url",
  "whatsapp_number",
] as const;
// The DB caps these at 500 chars (migration 172 for the new ones); handles are
// short, but a pasted profile URL is legitimately long, so use the URL bound.
const MAX_SOCIAL = 500;


export async function POST(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`contrib-profile:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("role, contributor_status")
    .eq("id", user.id)
    .single();

  if (
    !me ||
    me.role !== "contributor" ||
    me.contributor_status !== "approved"
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Whitelist only the keys we allow — prevents a hostile payload
  // from flipping role, contributor_status, slug, etc.
  const update: Partial<Record<AllowedKey, unknown>> = {};
  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      const value = body[key];
      // Coerce empty strings to null so the column is actually empty
      // rather than holding "".
      update[key] =
        typeof value === "string" && value.trim() === "" ? null : value;
    }
  }

  // Basic shape guards.
  if (update.gallery_urls !== undefined && update.gallery_urls !== null) {
    if (!Array.isArray(update.gallery_urls)) {
      return NextResponse.json(
        { error: "gallery_urls must be an array" },
        { status: 400 },
      );
    }
    const normalised = update.gallery_urls.map((u) => normalisePublicUrl(u, MAX_URL_LENGTH));
    if (normalised.some((url) => url === null)) {
      return NextResponse.json(
        { error: "gallery_urls must contain valid public URLs" },
        { status: 400 },
      );
    }
    const unique = Array.from(new Set(normalised as string[]));
    if (unique.length > MAX_GALLERY_URLS) {
      return NextResponse.json(
        { error: `gallery_urls can include at most ${MAX_GALLERY_URLS} URLs` },
        { status: 400 },
      );
    }
    update.gallery_urls = unique;
  }

  // The website really must be a URL — it is rendered as one and labelled as
  // one, and there is no handle that could stand in for it.
  if (update.website_url !== undefined && update.website_url !== null) {
    const norm = normalisePublicUrl(update.website_url as string, MAX_URL_LENGTH);
    if (norm === null) {
      return NextResponse.json(
        { error: "website_url must be a valid https/http URL" },
        { status: 400 },
      );
    }
    update.website_url = norm;
  }

  // Socials accept a handle OR a URL — see normaliseSocialValue. Before this,
  // an @handle typed into the Facebook box failed URL validation and, because
  // this route rejects on the first bad field, took the entire profile save
  // down with it: the reason a real contributor ended up with one handle
  // stored out of the several they had filled in.
  for (const key of SOCIAL_KEYS) {
    if (update[key] === undefined) continue;
    const norm = normaliseSocialValue(update[key], MAX_SOCIAL);
    if (norm === undefined) {
      return NextResponse.json(
        { error: `${key} must be a handle or a valid https/http link` },
        { status: 400 },
      );
    }
    update[key] = norm;
  }

  if (
    update.physical_latitude !== undefined &&
    update.physical_latitude !== null &&
    typeof update.physical_latitude !== "number"
  ) {
    return NextResponse.json(
      { error: "physical_latitude must be a number" },
      { status: 400 },
    );
  }
  if (
    update.physical_longitude !== undefined &&
    update.physical_longitude !== null &&
    typeof update.physical_longitude !== "number"
  ) {
    return NextResponse.json(
      { error: "physical_longitude must be a number" },
      { status: 400 },
    );
  }

  // String length guards for free-text fields.
  for (const [key, max] of [["bio", MAX_BIO], ["physical_address", MAX_ADDRESS]] as const) {
    if (update[key] != null && typeof update[key] === "string" && (update[key] as string).length > max) {
      return NextResponse.json({ error: `${key} exceeds maximum length of ${max}` }, { status: 400 });
    }
  }

  // Public contact email: length checked BEFORE the regex ever runs (never
  // hand an unbounded string to a pattern-match, even a ReDoS-safe one).
  if (update.contributor_contact_email != null) {
    const email = (update.contributor_contact_email as string).trim().toLowerCase();
    if (email.length > MAX_EMAIL || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "contributor_contact_email must be a valid email address" },
        { status: 400 },
      );
    }
    update.contributor_contact_email = email;
  }

  if (
    update.contributor_no_fixed_location !== undefined &&
    typeof update.contributor_no_fixed_location !== "boolean"
  ) {
    return NextResponse.json(
      { error: "contributor_no_fixed_location must be a boolean" },
      { status: 400 },
    );
  }
  // Switching to "no fixed location" clears any stale address/pin so the
  // two never disagree (mirrors the apply route's same rule).
  if (update.contributor_no_fixed_location === true) {
    update.physical_address = null;
    update.physical_latitude = null;
    update.physical_longitude = null;
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);

  if (error) {
    console.error("[/api/contributor/profile] update", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
