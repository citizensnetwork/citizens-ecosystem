/**
 * POST /api/intake/google-form
 *
 * The Google Form → map Contributor intake. The founder ticks "Approve" on a
 * row of the Form's responses Sheet; the Sheet's Apps Script
 * (tools/google-forms/intake.gs) POSTs that row here; this route puts the
 * Contributor live on the map and in Kingdom Discovery under a placeholder
 * account for the owner's email, and returns the listing's slug + URL for the
 * script to write back to the row and put in the welcome email. When the owner
 * signs in with Google using that email, Supabase links the sign-in to this
 * account and they land on their own dashboard (store.jsx bootstrap).
 *
 * Auth is an HMAC, not a user session:
 *   X-Intake-Timestamp: unix seconds (±300 s replay window)
 *   X-Intake-Signature: hex HMAC-SHA256(INTAKE_WEBHOOK_SECRET, `${ts}.${rawBody}`)
 * Any failure → 401 with no detail. No secret configured → 503 (fail closed).
 *
 * Idempotency: a second approval of the same row finds the owner's email
 * already registered → 409 `email_already_registered`; the script also skips
 * rows whose Status is already set.
 *
 * Body (raw Form labels — every label → slug decision is made here):
 *   { owner_email, organisation_name, organisation_type, primary_category,
 *     fixed_location, street_address?, maps_link?, geocoded?: {lat,lng},
 *     bio?, website?, contact_email?, instagram?, facebook?, tiktok?, youtube?,
 *     x?, linkedin?, whatsapp?, faith_alignment: true,
 *     permission_to_publish: true, logo?: {mime, base64}, cover?: {mime, base64} }
 * Response 200: { success, slug, url, warnings: string[] }
 * Errors: { error: <code>, message?: <human-readable, for the Sheet's Notes> }
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/v1Gate";
import { parseListingFields } from "@/lib/contributorFields";
import {
  decodeIntakeImage,
  geocodeWithMapTiler,
  mapOrganisationType,
  mapPrimaryCategory,
  MAX_IMAGE_BYTES,
  parseFixedLocation,
  parseMapsCoordinates,
  toLatLng,
  verifyIntakeSignature,
  type ImageResult,
  type IntakeImage,
  type LatLng,
} from "@/lib/intake/googleForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Just under Vercel's ~4.5 MB function body limit. */
const MAX_BODY_CHARS = 4_400_000;
/** Contributor logos/covers already live here (MediaPicker scope "event-cover"). */
const IMAGE_BUCKET = "event-images";
const MIN_SECRET_LENGTH = 32;

const fail = (status: number, error: string, message?: string) =>
  NextResponse.json(message ? { error, message } : { error }, { status });

const clip = (v: unknown) => String(v).slice(0, 100);

const IMAGE_REFUSED: Record<Exclude<ImageResult, { ok: true }>["reason"], string> = {
  too_large: `is larger than ${MAX_IMAGE_BYTES / 1_000_000} MB`,
  unsupported_type: "isn't a JPEG, PNG or WebP image",
  invalid: "couldn't be read",
};

export async function POST(request: Request) {
  const secret = process.env.INTAKE_WEBHOOK_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    console.error("[/api/intake/google-form] INTAKE_WEBHOOK_SECRET missing or too short");
    return fail(503, "intake_not_configured");
  }

  const rl = await checkRateLimit(`intake-google-form:${getClientIp(request)}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() } },
    );
  }

  // Raw body first: the signature covers the exact bytes sent.
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_CHARS) return fail(413, "payload_too_large");

  const authentic = verifyIntakeSignature({
    secret,
    timestamp: request.headers.get("x-intake-timestamp"),
    signature: request.headers.get("x-intake-signature"),
    body: rawBody,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!authentic) return fail(401, "unauthorized");

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, "invalid_json");
  }

  // POPIA: both boxes must be ticked on the Form.
  if (body.faith_alignment !== true || body.permission_to_publish !== true) {
    return fail(400, "consent_required", "Faith alignment and permission to publish must both be given.");
  }

  const kind = mapOrganisationType(body.organisation_type);
  if (!kind.ok) {
    return fail(400, "unknown_organisation_type", `Unknown Organisation Type "${clip(body.organisation_type)}".`);
  }
  const category = mapPrimaryCategory(body.primary_category);
  if (!category.ok) {
    return fail(400, "unknown_primary_category", `Unknown Primary category "${clip(body.primary_category)}".`);
  }
  const fixed = parseFixedLocation(body.fixed_location);
  if (fixed === "unknown") {
    return fail(400, "unknown_location_answer", `Unrecognised fixed-location answer "${clip(body.fixed_location)}".`);
  }
  const hasAddress = typeof body.street_address === "string" && body.street_address.trim() !== "";
  const noFixedLocation = fixed === false || (fixed === null && !hasAddress);

  const parsed = parseListingFields({
    display_name: body.organisation_name,
    claim_email: body.owner_email,
    contributor_kind: kind.value,
    contributor_category: category.value,
    bio: body.bio,
    website_url: body.website,
    contact_email: body.contact_email,
    instagram_handle: body.instagram,
    facebook_url: body.facebook,
    tiktok_handle: body.tiktok,
    youtube_url: body.youtube,
    x_handle: body.x,
    linkedin_url: body.linkedin,
    whatsapp_number: body.whatsapp,
    no_fixed_location: noFixedLocation,
    physical_address: body.street_address,
  });
  if (!parsed.ok) return fail(400, parsed.error);
  const fields = parsed.fields;

  const warnings: string[] = [];

  // Images are checked BEFORE anything is created; a refused image is a
  // warning (the owner adds it from the dashboard), never a failed intake.
  const images: { role: "logo" | "cover"; image: IntakeImage }[] = [];
  for (const role of ["logo", "cover"] as const) {
    const result = decodeIntakeImage(body[role]);
    if (!result) continue;
    if (result.ok) images.push({ role, image: result.image });
    else warnings.push(`${role === "logo" ? "Logo" : "Cover photo"} skipped: it ${IMAGE_REFUSED[result.reason]}.`);
  }

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/+$/, "");

  if (!fields.noFixedLocation) {
    const geocoded = body.geocoded as { lat?: unknown; lng?: unknown } | undefined;
    const point: LatLng | null =
      parseMapsCoordinates(body.maps_link) ??
      toLatLng(geocoded?.lat, geocoded?.lng) ??
      (fields.physicalAddress
        ? await geocodeWithMapTiler(fields.physicalAddress, {
            key: process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "",
            referer: `${origin}/`,
          })
        : null);
    if (point) {
      fields.latitude = point.lat;
      fields.longitude = point.lng;
    } else {
      warnings.push(
        "No map pin: the location couldn't be found. The listing is live in Kingdom Discovery; the owner can drop the pin from their dashboard.",
      );
    }
  }

  const admin = createAdminClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: fields.claimEmail,
    email_confirm: true,
    user_metadata: { full_name: fields.displayName, created_via: "google_form" },
  });
  if (createErr || !created?.user) {
    if (createErr?.message?.toLowerCase().includes("already been registered")) {
      return fail(409, "email_already_registered", "That owner email already has a Citizens Connect account.");
    }
    console.error("[/api/intake/google-form] createUser", createErr);
    return fail(500, "create_user_failed");
  }
  const userId = created.user.id;

  const storage = admin.storage.from(IMAGE_BUCKET);
  const uploadedPaths: string[] = [];
  const urls: { logo: string | null; cover: string | null } = { logo: null, cover: null };
  for (const { role, image } of images) {
    const path = `${userId}/intake/${role}-${randomUUID()}.${image.ext}`;
    const { error: upErr } = await storage.upload(path, image.bytes, {
      contentType: image.contentType,
      upsert: false,
    });
    if (upErr) {
      console.error(`[/api/intake/google-form] ${role} upload`, upErr);
      warnings.push(`${role === "logo" ? "Logo" : "Cover photo"} upload failed; the owner can add it from the dashboard.`);
      continue;
    }
    uploadedPaths.push(path);
    urls[role] = storage.getPublicUrl(path).data.publicUrl;
  }

  const { data: rpcData, error: rpcErr } = await admin.rpc("intake_create_contributor_profile", {
    _target_id: userId,
    _display_name: fields.displayName,
    _claim_email: fields.claimEmail,
    _contributor_kind: fields.kind,
    _contributor_category: fields.category,
    _bio: fields.bio,
    _website_url: fields.websiteUrl,
    _contact_email: fields.contactEmail,
    _instagram_handle: fields.socials.instagram_handle,
    _facebook_url: fields.socials.facebook_url,
    _tiktok_handle: fields.socials.tiktok_handle,
    _youtube_url: fields.socials.youtube_url,
    _x_handle: fields.socials.x_handle,
    _linkedin_url: fields.socials.linkedin_url,
    _whatsapp_number: fields.socials.whatsapp_number,
    _no_fixed_location: fields.noFixedLocation,
    _physical_address: fields.physicalAddress,
    _physical_latitude: fields.latitude,
    _physical_longitude: fields.longitude,
    _logo_url: urls.logo,
    // profiles.cover_photo_urls is an ordered [{url, caption}] array.
    _cover_photo_urls: urls.cover ? [{ url: urls.cover, caption: null }] : [],
  });

  const result = rpcData as { success?: boolean; reason?: string; slug?: string } | null;
  if (rpcErr || !result?.success || !result.slug) {
    // Roll back so a retry starts clean: no orphaned account or images.
    if (uploadedPaths.length) await storage.remove(uploadedPaths).catch(() => {});
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    console.error("[/api/intake/google-form] profile rpc", rpcErr, result);
    return fail(500, result?.reason ?? "create_failed");
  }

  console.info("[/api/intake/google-form] live", { userId, slug: result.slug, warnings: warnings.length });
  return NextResponse.json({
    success: true,
    slug: result.slug,
    url: `${origin}/c/${result.slug}`,
    warnings,
  });
}
