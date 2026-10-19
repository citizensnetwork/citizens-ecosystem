/**
 * POST /api/contributor/[handle]/profile
 *
 * An active editor updates the listing's public profile through
 * update_contributor_public_profile (migration 193). The profiles UPDATE
 * policy is not widened. Owners keep POST /api/contributor/profile.
 * DELETE is refused for everyone: removing a listing is admin-only.
 *
 * Slug, billing, role, status, contributor_hidden and email are not
 * accepted. A body that names one of them is 403 and nothing is written.
 */

import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { normalisePublicUrl, normaliseSocialField } from "@/lib/publicUrl";

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
  "contributor_category",
] as const;

type AllowedKey = (typeof ALLOWED_KEYS)[number];

const SOCIAL_KEYS = [
  "instagram_handle",
  "facebook_url",
  "tiktok_handle",
  "youtube_url",
  "x_handle",
  "linkedin_url",
  "whatsapp_number",
] as const;

const MAX_GALLERY = 6;
const MAX_URL = 2_000;
const MAX_BIO = 2_000;
const MAX_ADDRESS = 500;
const MAX_EMAIL = 254;
const MAX_CATEGORY = 80;
const MAX_SOCIAL = 500;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]{1,24}$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkDashboardAccess(handle, request);
  if (!access.hasAccess || access.teamRole !== "editor") {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const rl = await checkRateLimit(`editor-profile:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.includes(key as AllowedKey)) {
      return NextResponse.json({ error: "forbidden_field", field: key }, { status: 403 });
    }
  }

  const update: Partial<Record<AllowedKey, unknown>> = {};
  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      const value = body[key];
      update[key] = typeof value === "string" && value.trim() === "" ? null : value;
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  if (update.gallery_urls !== undefined && update.gallery_urls !== null) {
    if (!Array.isArray(update.gallery_urls)) {
      return NextResponse.json({ error: "gallery_urls must be an array" }, { status: 400 });
    }
    const normalised = update.gallery_urls.map((u) => normalisePublicUrl(u, MAX_URL));
    if (normalised.some((url) => url === null || !url!.startsWith("https://"))) {
      return NextResponse.json({ error: "gallery_urls must contain https URLs" }, { status: 400 });
    }
    const unique = Array.from(new Set(normalised as string[]));
    if (unique.length > MAX_GALLERY) {
      return NextResponse.json({ error: `gallery_urls can include at most ${MAX_GALLERY} URLs` }, { status: 400 });
    }
    update.gallery_urls = unique;
  }

  if (update.website_url != null) {
    const norm = normalisePublicUrl(update.website_url, MAX_URL);
    if (norm === null) {
      return NextResponse.json({ error: "website_url must be a valid https/http URL" }, { status: 400 });
    }
    update.website_url = norm;
  }
  if (update.logo_url != null) {
    const norm = normalisePublicUrl(update.logo_url, MAX_URL);
    if (norm === null || !norm.startsWith("https://")) {
      return NextResponse.json({ error: "logo_url must be an https URL" }, { status: 400 });
    }
    update.logo_url = norm;
  }

  for (const key of SOCIAL_KEYS) {
    if (update[key] === undefined) continue;
    const norm = normaliseSocialField(key, update[key], MAX_SOCIAL);
    if (norm === undefined) {
      return NextResponse.json({ error: `${key} must be a handle or a valid link` }, { status: 400 });
    }
    update[key] = norm;
  }

  for (const [key, max] of [["bio", MAX_BIO], ["physical_address", MAX_ADDRESS], ["contributor_category", MAX_CATEGORY]] as const) {
    if (update[key] != null && typeof update[key] === "string" && (update[key] as string).length > max) {
      return NextResponse.json({ error: `${key} exceeds maximum length of ${max}` }, { status: 400 });
    }
  }

  if (update.contributor_contact_email != null) {
    const email = String(update.contributor_contact_email).trim().toLowerCase();
    if (email.length > MAX_EMAIL || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "contributor_contact_email must be a valid email address" }, { status: 400 });
    }
    update.contributor_contact_email = email;
  }

  for (const key of ["physical_latitude", "physical_longitude"] as const) {
    if (update[key] !== undefined && update[key] !== null && typeof update[key] !== "number") {
      return NextResponse.json({ error: `${key} must be a number` }, { status: 400 });
    }
  }
  if (
    update.contributor_no_fixed_location !== undefined &&
    typeof update.contributor_no_fixed_location !== "boolean"
  ) {
    return NextResponse.json({ error: "contributor_no_fixed_location must be a boolean" }, { status: 400 });
  }
  if (update.contributor_no_fixed_location === true) {
    update.physical_address = null;
    update.physical_latitude = null;
    update.physical_longitude = null;
  }

  const { data, error } = await supabase.rpc("update_contributor_public_profile", {
    p_contributor_id: access.contributorId,
    p_patch: update,
  });
  if (error || !data || (data as { success?: boolean }).success === false) {
    const message = error?.message ?? "";
    if (message.includes("forbidden_field")) {
      return NextResponse.json({ error: "forbidden_field" }, { status: 403 });
    }
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/** Listing removal is admin-only (migration 178). This route never does it. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const { user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await checkDashboardAccess(handle, request);
  return NextResponse.json({ error: "Access denied" }, { status: 403 });
}
