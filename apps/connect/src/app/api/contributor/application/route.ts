/**
 * The applicant's own Contributor application (D-12).
 *
 *   GET   /api/contributor/application   the caller's latest application
 *   PATCH /api/contributor/application   edit it — ONLY while it is `pending`
 *
 * Why this exists. A pending applicant gets their Dashboard straight away and
 * can finish their profile (logo, cover, bio, socials, pin, contact email), but
 * nothing of theirs may be public until an admin approves. `profiles`, `places`
 * and `news_posts` are world-readable through the API, so anything saved there
 * while pending would leak. Their edits are therefore STAGED on their own
 * `contributor_applications` row — readable only by the owner and admins — and
 * `approve_contributor_application` copies them onto the profile.
 *
 * Writes use the service-role client because migration 180 removed every client
 * write privilege on `contributor_applications` (a client must not be able to
 * rewrite its row after validation, or set its own status). That is safe only
 * because of three things in this file: the row is found through the CALLER'S
 * session (RLS: their own rows), the update is pinned to that row id + the
 * verified `user.id` + `status = 'pending'`, and every field is an allowlisted,
 * validated key — nothing in the body can name a column we did not list
 * (status, user_id, reviewer_id, rejection_reason…).
 */

import { getRouteAuth } from "@/lib/supabase/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isContributorType } from "@/lib/categories";
import { checkSocialField, coercePublicUrl, normalisePublicUrl } from "@/lib/publicUrl";
import {
  MAX_ADDRESS,
  MAX_BIO,
  MAX_DISPLAY_NAME,
  MAX_SOCIAL,
  MAX_URL,
  SOCIAL_FIELDS,
  normaliseEmail,
  trimOrNull,
} from "@/lib/contributorFields";
import { COVER_PHOTOS_MAX, COVER_PHOTO_CAPTION_MAX, isContributorKind } from "@/types/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything the applicant may read back (never reviewer ids or another person's data). */
const APPLICATION_COLUMNS = [
  "id",
  "status",
  "submitted_at",
  "reviewed_at",
  "rejection_reason",
  "display_name",
  "contributor_kind",
  "contributor_category",
  "bio",
  "website_url",
  "instagram_handle",
  "facebook_url",
  "tiktok_handle",
  "youtube_url",
  "x_handle",
  "linkedin_url",
  "whatsapp_number",
  "contributor_contact_email",
  "no_fixed_location",
  "physical_address",
  "physical_latitude",
  "physical_longitude",
  "logo_url",
  "cover_photo_urls",
].join(", ");

function tooMany(resetMs: number) {
  return NextResponse.json(
    { error: "Too many requests" },
    { status: 429, headers: { "Retry-After": Math.ceil(resetMs / 1000).toString() } },
  );
}

export async function GET(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`contrib-application-read:${user.id}`, RATE_LIMITS.read);
  if (!rl.success) return tooMany(rl.resetMs);

  // The caller's own session: RLS returns only their rows.
  const { data, error } = await supabase
    .from("contributor_applications")
    .select(APPLICATION_COLUMNS)
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[/api/contributor/application] read", error);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? null });
}

/** An https URL (or null to clear); anything else is refused. Uploaded media is always https. */
function httpsUrl(value: unknown): string | null | undefined {
  if (value === null || (typeof value === "string" && value.trim() === "")) return null;
  const url = normalisePublicUrl(value, MAX_URL);
  return url !== null && url.startsWith("https://") ? url : undefined;
}

type CoverPhoto = { url: string; caption: string | null };

/** `[{url, caption?}]` or `[url]`; at most COVER_PHOTOS_MAX, every URL https. `undefined` = refuse. */
function coverPhotos(value: unknown): CoverPhoto[] | undefined {
  if (!Array.isArray(value) || value.length > COVER_PHOTOS_MAX) return undefined;
  const out: CoverPhoto[] = [];
  for (const item of value) {
    const rawUrl = typeof item === "string" ? item : (item as { url?: unknown } | null)?.url;
    const url = httpsUrl(rawUrl);
    if (!url) return undefined;
    const rawCaption = typeof item === "object" && item !== null ? (item as { caption?: unknown }).caption : null;
    out.push({ url, caption: trimOrNull(rawCaption, COVER_PHOTO_CAPTION_MAX) });
  }
  return out;
}

function coordinate(value: unknown, limit: number): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit ? value : undefined;
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function PATCH(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`contrib-application-edit:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) return tooMany(rl.resetMs);

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only a PENDING application is editable; once an admin has decided, the row is theirs.
  const { data: app } = await supabase
    .from("contributor_applications")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (!app) return NextResponse.json({ error: "no_pending_application" }, { status: 409 });

  const update: Record<string, unknown> = {};
  const has = (key: string) => key in body;

  if (has("display_name")) {
    const name = trimOrNull(body.display_name, MAX_DISPLAY_NAME);
    if (!name || name.length < 2) return badRequest("display_name_required");
    update.display_name = name;
  }
  if (has("contributor_category")) {
    if (body.contributor_category !== null && !isContributorType(body.contributor_category)) {
      return badRequest("invalid_contributor_category");
    }
    update.contributor_category = body.contributor_category;
  }
  if (has("contributor_kind")) {
    if (body.contributor_kind !== null && !isContributorKind(body.contributor_kind)) {
      return badRequest("invalid_contributor_kind");
    }
    update.contributor_kind = body.contributor_kind;
  }
  if (has("bio")) update.bio = trimOrNull(body.bio, MAX_BIO);

  if (has("website_url")) {
    const raw = trimOrNull(body.website_url, MAX_URL);
    const website = raw === null ? null : coercePublicUrl(raw, MAX_URL);
    if (raw !== null && website === null) return badRequest("Website must be a valid web address (for example yourministry.org).");
    update.website_url = website;
  }

  for (const [key, label] of SOCIAL_FIELDS) {
    if (!has(key)) continue;
    const check = checkSocialField(key, body[key], MAX_SOCIAL);
    if (!check.ok) {
      return badRequest(
        key === "whatsapp_number"
          ? "WhatsApp must be a phone number (e.g. 071 234 5678 or +27 71 234 5678) or a wa.me link."
          : `${label} must be a handle (no spaces) or a valid web address.`,
      );
    }
    update[key] = check.value;
  }

  if (has("contributor_contact_email")) {
    const raw = body.contributor_contact_email;
    const blank = raw === null || (typeof raw === "string" && raw.trim() === "");
    const email = blank ? null : normaliseEmail(raw);
    if (!blank && !email) return badRequest("Contact email must be a valid email address.");
    update.contributor_contact_email = email;
  }

  if (has("logo_url")) {
    const logo = httpsUrl(body.logo_url);
    if (logo === undefined) return badRequest("The logo must be an uploaded image (an https link).");
    update.logo_url = logo;
  }
  if (has("cover_photo_urls")) {
    const covers = coverPhotos(body.cover_photo_urls);
    if (covers === undefined) {
      return badRequest(`Cover photos must be up to ${COVER_PHOTOS_MAX} uploaded images (https links).`);
    }
    update.cover_photo_urls = covers;
  }

  if (has("no_fixed_location") && typeof body.no_fixed_location !== "boolean") {
    return badRequest("no_fixed_location must be true or false.");
  }
  if (has("physical_address")) update.physical_address = trimOrNull(body.physical_address, MAX_ADDRESS);
  if (has("physical_latitude")) {
    const lat = coordinate(body.physical_latitude, 90);
    if (lat === undefined) return badRequest("physical_latitude must be a number between -90 and 90.");
    update.physical_latitude = lat;
  }
  if (has("physical_longitude")) {
    const lng = coordinate(body.physical_longitude, 180);
    if (lng === undefined) return badRequest("physical_longitude must be a number between -180 and 180.");
    update.physical_longitude = lng;
  }
  if (has("no_fixed_location")) update.no_fixed_location = body.no_fixed_location;
  // A pin needs BOTH coordinates, and "no fixed location" means no address or pin at all —
  // the same rules as apply, so the row can never hold a half pin.
  if (update.no_fixed_location === true) {
    update.physical_address = null;
    update.physical_latitude = null;
    update.physical_longitude = null;
  } else if ("physical_latitude" in update || "physical_longitude" in update) {
    if (update.physical_latitude == null || update.physical_longitude == null) {
      update.physical_latitude = null;
      update.physical_longitude = null;
    }
  }

  if (Object.keys(update).length === 0) return badRequest("nothing_to_update");

  // Pinned to this row, this user and the pending state: if an admin decided
  // a moment ago, nothing is written.
  const { data: updated, error } = await createAdminClient()
    .from("contributor_applications")
    .update(update)
    .eq("id", app.id)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .select("id");
  if (error) {
    console.error("[/api/contributor/application] update", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "no_pending_application" }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
