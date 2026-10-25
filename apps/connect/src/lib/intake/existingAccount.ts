/**
 * Google Form intake when the owner email already has an auth user.
 * A citizen account becomes a pending upgrade (no listing yet). A Contributor
 * or an admin is left untouched.
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sourcesFromListing } from "@/lib/automation/sources";
import { parseAutoUpdateLevel } from "@/lib/automation/suggestions";
import { normaliseEmail, type ListingFields } from "@/lib/contributorFields";
import { sendEmail } from "@/lib/email/send";
import type { IntakeImage } from "@/lib/intake/googleForm";
import { newUpgradeToken, UPGRADE_TTL_MS } from "@/lib/intake/upgradeToken";
import { clearUpgradeImageColumns, deleteUpgradeImages, sendUpgradeFlag, upgradeEmail } from "@/lib/intake/upgradeSideEffects";

const IMAGE_BUCKET = "event-images";

const AWAITING =
  "This owner already has a Citizens account. A confirmation link was emailed to that account and expires in 7 days. " +
  "No listing was created yet. Tick Resend to send the link again.";

const REUSED =
  "A confirmation is already waiting for this account. No second email was sent, and nothing was changed. " +
  "Tick Resend if they need the link again.";

type ProfileHit = {
  id?: string;
  role?: string | null;
  email?: string | null;
  contributor_slug?: string | null;
  contributor_hidden?: boolean | null;
  deleted_at?: string | null;
};

type CreateResult = {
  success?: boolean;
  reason?: string;
  reused?: boolean;
  request_id?: string;
  expires_at?: string;
  notify_admin?: boolean;
  expired_request_id?: string | null;
  logo_storage_path?: string | null;
  cover_storage_path?: string | null;
};

const fail = (status: number, error: string, message?: string) =>
  NextResponse.json(message ? { error, message } : { error }, { status });

export async function respondWhenEmailExists(args: {
  admin: SupabaseClient;
  email: string;
  origin: string;
  fields: ListingFields;
  images: { role: "logo" | "cover"; image: IntakeImage }[];
  warnings: string[];
  autoUpdate: unknown;
}): Promise<NextResponse> {
  const { admin, email, origin, fields, images, warnings, autoUpdate } = args;
  const { data, error } = await admin
    .from("profiles")
    .select("id, role, email, contributor_slug, contributor_hidden, deleted_at")
    .eq("email", email)
    .maybeSingle();

  if (error || !data) {
    return fail(409, "email_already_registered", "That email already has an account, but the account could not be read. Nothing was created.");
  }

  const existing = data as ProfileHit;
  if (existing.role === "contributor" && existing.contributor_slug) {
    const url = `${origin}/c/${existing.contributor_slug}`;
    const hidden = existing.contributor_hidden ? " (currently hidden)" : "";
    return NextResponse.json(
      {
        error: "listing_exists",
        message: `${email} already has a Contributor listing${hidden}: ${url} — nothing was changed.`,
        url,
      },
      { status: 409 },
    );
  }

  if (existing.role === "contributor") {
    return fail(409, "account_not_eligible", "That email already belongs to a Contributor account, so nothing was changed.");
  }
  if (existing.role === "admin" || existing.deleted_at) {
    return fail(409, "account_not_eligible", "That email can't take a Contributor listing this way, so nothing was changed.");
  }
  if (existing.role !== "citizen" || typeof existing.id !== "string") {
    return fail(409, "email_already_registered", "That email already has an account, so no listing was created. Nothing was changed.");
  }

  const uploaded: string[] = [];
  const paths: { logo: string | null; cover: string | null } = { logo: null, cover: null };
  const urls: { logo: string | null; cover: string | null } = { logo: null, cover: null };
  const storage = admin.storage.from(IMAGE_BUCKET);
  for (const { role, image } of images) {
    const path = `${existing.id}/intake-upgrade/${randomUUID()}.${image.ext}`;
    const { error: upErr } = await storage.upload(path, image.bytes, { contentType: image.contentType, upsert: false });
    if (upErr) {
      warnings.push(`${role === "logo" ? "Logo" : "Cover photo"} upload failed; it can be added after the upgrade is confirmed.`);
      continue;
    }
    uploaded.push(path);
    paths[role] = path;
    urls[role] = storage.getPublicUrl(path).data.publicUrl;
  }

  const consent = autoUpdate === undefined ? null : parseAutoUpdateLevel(autoUpdate);
  if (consent?.warning) warnings.push(consent.warning);
  const level = consent?.level ?? null;
  const sources =
    consent === null
      ? []
      : sourcesFromListing(
          {
            websiteUrl: fields.websiteUrl,
            youtube: fields.socials.youtube_url,
            facebook: fields.socials.facebook_url,
            instagram: fields.socials.instagram_handle,
            tiktok: fields.socials.tiktok_handle,
          },
          level !== "off",
        );

  const token = newUpgradeToken();
  const { data: rpcData, error: rpcErr } = await admin.rpc("create_intake_upgrade_request", {
    _profile_id: existing.id,
    _token_hash: token.hash,
    _expires_at: new Date(Date.now() + UPGRADE_TTL_MS).toISOString(),
    _display_name: fields.displayName,
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
    _logo_storage_path: paths.logo,
    _cover_photo_urls: urls.cover ? [{ url: urls.cover, caption: null }] : [],
    _cover_storage_path: paths.cover,
    _auto_update_level: level,
    _sources: sources,
  });

  const created = rpcData as CreateResult | null;
  if (rpcErr || !created?.success || !created.request_id) {
    await deleteUpgradeImages(admin, uploaded);
    console.error("[/api/intake/google-form] upgrade create", rpcErr?.code ?? created?.reason ?? "failed");
    return fail(500, created?.reason ?? "create_failed");
  }

  if (created.notify_admin && created.expired_request_id) {
    await deleteUpgradeImages(admin, [created.logo_storage_path, created.cover_storage_path]);
    await clearUpgradeImageColumns(admin, [created.expired_request_id]);
    await sendUpgradeFlag({
      notify: true,
      name: fields.displayName,
      outcome: "expired",
      requestId: created.expired_request_id,
    });
  }

  if (created.reused) {
    await deleteUpgradeImages(admin, uploaded);
    return NextResponse.json({
      success: true,
      status: "awaiting_confirmation",
      request_id: created.request_id,
      email: "skipped",
      message: REUSED,
      warnings,
    });
  }

  const to = normaliseEmail(existing.email) ?? email;
  const expiresAt = typeof created.expires_at === "string" ? created.expires_at : new Date(Date.now() + UPGRADE_TTL_MS).toISOString();
  const emailResult = await sendEmail({
    to,
    ...upgradeEmail({ name: fields.displayName, origin, rawToken: token.raw, expiresAt }),
  });
  const note = emailResult === "sent" ? AWAITING : `${AWAITING} The confirmation email could not be sent. Tick Resend.`;

  return NextResponse.json({
    success: true,
    status: "awaiting_confirmation",
    request_id: created.request_id,
    email: emailResult,
    message: note,
    warnings,
  });
}
