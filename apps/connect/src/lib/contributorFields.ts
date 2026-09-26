/**
 * Field rules for every route that creates a Contributor listing on someone
 * else's behalf — admin Create (`/api/admin/contributors/create`) and the
 * Google Form intake (`/api/intake/google-form`). One module so the two can't
 * drift: the ReDoS-safe email check, the stored-XSS URL rules and the length
 * caps each live here exactly once.
 *
 * `parseListingFields` validates EVERYTHING before the caller writes anything,
 * so a bad field can never leave a half-created auth user behind.
 */

import { isContributorType, type ContributorType } from "@/lib/categories";
import { coercePublicUrl, normaliseSocialValue } from "@/lib/publicUrl";
import { isContributorKind, type ContributorKind } from "@/types/db";

export const MAX_DISPLAY_NAME = 120;
const MIN_DISPLAY_NAME = 2;
export const MAX_BIO = 1_000;
export const MAX_URL = 500;
export const MAX_ADDRESS = 300;
/** Same bound as /api/contributor/profile and the DB length checks (mig 172). */
export const MAX_SOCIAL = 500;
export const MAX_EMAIL = 254;

// Bounded quantifiers (not `+`) so this can't be driven into polynomial
// backtracking on attacker-shaped input, AND the length is checked before it
// ever runs (normaliseEmail) — the §3AL CodeQL lesson.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]{1,24}$/;

/** Every social column on `profiles`, with the label used in error messages. */
export const SOCIAL_FIELDS = [
  ["instagram_handle", "Instagram"],
  ["facebook_url", "Facebook"],
  ["tiktok_handle", "TikTok"],
  ["youtube_url", "YouTube"],
  ["x_handle", "X"],
  ["linkedin_url", "LinkedIn"],
  ["whatsapp_number", "WhatsApp"],
] as const;
export type SocialField = (typeof SOCIAL_FIELDS)[number][0];

export function trimOrNull(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

/** Lower-cased, trimmed email, or null if it isn't a plausible address. */
export function normaliseEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const email = v.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) return null;
  return email;
}

function coordOrNull(v: unknown, limit: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit ? v : null;
}

export type ListingFields = {
  displayName: string;
  claimEmail: string;
  kind: ContributorKind | null;
  category: ContributorType;
  bio: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  socials: Record<SocialField, string | null>;
  noFixedLocation: boolean;
  physicalAddress: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type ListingFieldsResult =
  | { ok: true; fields: ListingFields }
  | { ok: false; error: string };

/**
 * Validate + normalise a listing payload. Keys are the snake_case API names
 * (display_name, claim_email, contributor_kind, contributor_category, bio,
 * website_url, contact_email, the SOCIAL_FIELDS, no_fixed_location,
 * physical_address, physical_latitude, physical_longitude).
 *
 * An unknown kind is coerced to null (kind is optional everywhere); an
 * unknown category is an error — new writes must use the 12 Contributor
 * types. "No fixed location" nulls the address and pin regardless of input,
 * and a pin needs BOTH coordinates or neither is kept.
 */
export function parseListingFields(payload: Record<string, unknown>): ListingFieldsResult {
  const displayName = trimOrNull(payload.display_name, MAX_DISPLAY_NAME);
  if (!displayName || displayName.length < MIN_DISPLAY_NAME) {
    return { ok: false, error: "display_name_required" };
  }

  const claimEmail = normaliseEmail(payload.claim_email);
  if (!claimEmail) return { ok: false, error: "valid_claim_email_required" };

  const kind = isContributorKind(payload.contributor_kind) ? payload.contributor_kind : null;

  if (!isContributorType(payload.contributor_category)) {
    return { ok: false, error: "contributor_category_required" };
  }
  const category = payload.contributor_category;

  const rawWebsite = trimOrNull(payload.website_url, MAX_URL);
  const websiteUrl = rawWebsite === null ? null : coercePublicUrl(rawWebsite, MAX_URL);
  if (rawWebsite !== null && websiteUrl === null) {
    return { ok: false, error: "invalid_website_url" };
  }

  const hasContactEmail = typeof payload.contact_email === "string" && payload.contact_email.trim() !== "";
  const contactEmail = hasContactEmail ? normaliseEmail(payload.contact_email) : null;
  if (hasContactEmail && !contactEmail) return { ok: false, error: "invalid_contact_email" };

  const socials = {} as Record<SocialField, string | null>;
  for (const [key] of SOCIAL_FIELDS) {
    const norm = normaliseSocialValue(payload[key], MAX_SOCIAL);
    if (norm === undefined) return { ok: false, error: `invalid_${key}` };
    socials[key] = norm;
  }

  const noFixedLocation = payload.no_fixed_location === true;
  let latitude = noFixedLocation ? null : coordOrNull(payload.physical_latitude, 90);
  let longitude = noFixedLocation ? null : coordOrNull(payload.physical_longitude, 180);
  if (latitude === null || longitude === null) latitude = longitude = null;

  return {
    ok: true,
    fields: {
      displayName,
      claimEmail,
      kind,
      category,
      bio: trimOrNull(payload.bio, MAX_BIO),
      websiteUrl,
      contactEmail,
      socials,
      noFixedLocation,
      physicalAddress: noFixedLocation ? null : trimOrNull(payload.physical_address, MAX_ADDRESS),
      latitude,
      longitude,
    },
  };
}
