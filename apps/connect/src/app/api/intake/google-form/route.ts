/**
 * POST /api/intake/google-form
 *
 * The Google Form → map Contributor intake. The founder ticks "Approve" on a
 * row of the Form's responses Sheet; the Sheet's Apps Script
 * (tools/google-forms/intake.gs) POSTs that row here; this route puts the
 * Contributor live in Kingdom Discovery (and on the map when it has a pin)
 * under a placeholder account, and returns the listing's slug + URL, whether it is on
 * the map, and whether the owner already has an account, for the script to write back
 * to the row and put in the welcome email.
 *
 * Verify-first (C10, migration 196): NOTHING is attached to anybody until the owner has
 * proved the address and said yes on a confirm screen.
 *   - the address has no account: the placeholder holds it; the owner signs in as it and
 *     confirms the listing is theirs ("self").
 *   - the address already has an account: the placeholder gets an alias address that is
 *     never mailed (lib/placeholderEmail.ts) and the owner is asked to attach it to their
 *     own account ("attach"). Nothing on that account changes before they confirm.
 * Either way a listing_claims ledger row records the request, and the Sheet polls
 * POST /api/intake/google-form/status for "Awaiting owner" / "Owner confirmed" / "Owner declined".
 *
 * Auth is an HMAC, not a user session:
 *   X-Intake-Timestamp: unix seconds (±300 s replay window)
 *   X-Intake-Signature: hex HMAC-SHA256(INTAKE_WEBHOOK_SECRET, `${ts}.${rawBody}`)
 * Any failure → 401 with no detail. No secret configured → 503 (fail closed).
 *
 * Idempotency: a second approval of the same row finds the owner's email already
 * holding a listing → 409 `listing_exists` (with the live listing's URL), or already
 * waiting for the owner → 409 `listing_pending`; an email that belongs to an
 * administrator or to an applicant → 409 `email_already_registered`. All carry a
 * `message` saying what to do. The script also skips rows whose Status is already set.
 *
 * Body (raw Form labels — every label → slug decision is made here):
 *   { owner_email, organisation_name, organisation_type, primary_category,
 *     fixed_location, street_address?, maps_link?, geocoded?: {lat,lng},
 *     bio?, website?, contact_email?, instagram?, facebook?, tiktok?, youtube?,
 *     x?, linkedin?, whatsapp?, faith_alignment: true,
 *     permission_to_publish: true, logo?: {mime, base64}, cover?: {mime, base64},
 *     auto_update?: 'off'|'suggest'|'events_auto' (Form "Keeping your listing up to date",
 *     mig 181: stored with a consent stamp, and the listed sources are saved) }
 * Response 200: { success, slug, url, warnings: string[], on_map: boolean,
 *   owner_has_account: boolean, awaiting_owner: true }
 *   owner_has_account picks the wording of the welcome email (an owner with an account is asked to
 *   attach the listing to it; a new owner is asked to confirm it is theirs).
 *   on_map is hasMapPin: the pin was found (maps link, the Sheet's geocode, or MapTiler) and the listing is not
 *   "no fixed location". The script's welcome email says "on the map" only when it is true (tracker C21).
 * Errors: { error: <code>, message?: <human-readable, for the Sheet's Notes> }
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasMapPin, parseListingFields } from "@/lib/contributorFields";
import { parseAutoUpdateLevel } from "@/lib/automation/suggestions";
import { sourcesFromListing } from "@/lib/automation/sources";
import {
  decodeIntakeImage,
  geocodeWithMapTiler,
  mapOrganisationType,
  mapPrimaryCategory,
  MAX_IMAGE_BYTES,
  parseFixedLocation,
  parseMapsCoordinates,
  toLatLng,
  type ImageResult,
  type IntakeImage,
  type LatLng,
} from "@/lib/intake/googleForm";
import { gateIntakeRequest } from "@/lib/intake/gate";
import { createListingUser, pendingListingMessage, registerListingClaim } from "@/lib/listingClaim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Just under Vercel's ~4.5 MB function body limit. */
const MAX_BODY_CHARS = 4_400_000;
/** Contributor logos/covers already live here (MediaPicker scope "event-cover"). */
const IMAGE_BUCKET = "event-images";

const fail = (status: number, error: string, message?: string) =>
  NextResponse.json(message ? { error, message } : { error }, { status });

const clip = (v: unknown) => String(v).slice(0, 100);

const IMAGE_REFUSED: Record<Exclude<ImageResult, { ok: true }>["reason"], string> = {
  too_large: `is larger than ${MAX_IMAGE_BYTES / 1_000_000} MB`,
  unsupported_type: "isn't a JPEG, PNG or WebP image",
  invalid: "couldn't be read",
};

export async function POST(request: Request) {
  // Raw body first: the signature covers the exact bytes sent.
  const gate = await gateIntakeRequest(request, {
    rateKey: "intake-google-form",
    logTag: "/api/intake/google-form",
    maxBodyChars: MAX_BODY_CHARS,
  });
  if (!gate.ok) return gate.response;
  const rawBody = gate.rawBody;

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

  // lenientSocials: nobody is here to correct a Form answer (the row is approved
  // later), so a social that isn't a link/handle/number — "Grace Radio" typed
  // into the Facebook box, a local-format phone we can't read — is left empty
  // and reported in the warnings (the Sheet's Notes) rather than refusing a
  // listing that is otherwise good. Dangerous values still fail it outright.
  const parsed = parseListingFields(
    {
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
    },
    { lenientSocials: true },
  );
  if (!parsed.ok) return fail(400, parsed.error);
  const fields = parsed.fields;

  const warnings: string[] = [...parsed.notes];

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

  const listingUser = await createListingUser(admin, {
    claimEmail: fields.claimEmail,
    userMetadata: { full_name: fields.displayName, created_via: "google_form" },
    origin,
  });
  if (!listingUser.ok) {
    return NextResponse.json(
      {
        error: listingUser.error,
        ...(listingUser.message ? { message: listingUser.message } : {}),
        ...(listingUser.url ? { url: listingUser.url } : {}),
      },
      { status: listingUser.status },
    );
  }
  const { userId, ownerHasAccount } = listingUser;

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

  // The ledger row (mig 196): the owner is now asked to confirm. A second open request for the same
  // address is refused by the database, so roll this placeholder back and say which one is waiting.
  const claim = await registerListingClaim(admin, {
    placeholderId: userId,
    slug: result.slug,
    claimEmail: fields.claimEmail,
    source: "google_form",
  });
  if (!claim.ok) {
    if (uploadedPaths.length) await storage.remove(uploadedPaths).catch(() => {});
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    if (claim.reason === "duplicate") {
      return fail(409, "listing_pending", pendingListingMessage(fields.claimEmail, claim.existingSlug, origin));
    }
    return fail(500, "claim_ledger_failed");
  }

  // Listing automation (mig 181): the Form's "Keeping your listing up to date" answer and
  // the sources the owner listed. Only when the script sent the answer at all. Fail-closed:
  // the listing is already live, so a problem here is a Note on the Sheet, never a failed
  // intake, and it can only leave automation off or inert. Sources go in first (switched
  // on only if consent was given), the consent level last, so a half-finished run can
  // never leave automation ON without its sources recorded.
  if (body.auto_update !== undefined) {
    const consent = parseAutoUpdateLevel(body.auto_update);
    if (consent.warning) warnings.push(consent.warning);
    let stage = "sources";
    try {
      const rows = sourcesFromListing(
        {
          websiteUrl: fields.websiteUrl,
          youtube: fields.socials.youtube_url,
          facebook: fields.socials.facebook_url,
          instagram: fields.socials.instagram_handle,
          tiktok: fields.socials.tiktok_handle,
        },
        consent.level !== "off",
      );
      if (rows.length) {
        const { error } = await admin.from("listing_sources").insert(rows.map((r) => ({ contributor_id: userId, ...r })));
        if (error) throw error;
      }
      stage = "consent";
      if (consent.level !== "off") {
        const { error } = await admin
          .from("profiles")
          .update({
            auto_update_level: consent.level,
            auto_update_consent_at: new Date().toISOString(),
            auto_update_consent_source: "google_form",
          })
          .eq("id", userId);
        if (error) throw error;
      }
    } catch (e) {
      console.error(`[/api/intake/google-form] automation ${stage}`, e);
      warnings.push(
        stage === "sources"
          ? "Automatic updates: the owner's website and social links could not be saved as sources; the owner can add them in their dashboard."
          : "Automatic updates: the owner's choice could not be saved, so automatic updates are off. The owner can switch them on in their dashboard.",
      );
    }
  }

  console.info("[/api/intake/google-form] live", { userId, slug: result.slug, warnings: warnings.length });
  return NextResponse.json({
    success: true,
    slug: result.slug,
    url: `${origin}/c/${result.slug}`,
    warnings,
    on_map: hasMapPin({ no_fixed_location: fields.noFixedLocation, physical_latitude: fields.latitude, physical_longitude: fields.longitude }),
    owner_has_account: ownerHasAccount,
    awaiting_owner: true,
  });
}
