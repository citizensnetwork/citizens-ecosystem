/**
 * Mail and image cleanup around an intake upgrade.
 * The database decides the state. These helpers only announce it and remove
 * files the database has already finished with. They never throw.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { intakeUpgradeFlagEmail, intakeUpgradeEmail, ownerWelcomeEmail } from "@/lib/email/templates";
import { adminNotifyEmail, sendEmail, siteOrigin } from "@/lib/email/send";
import { hasMapPin } from "@/lib/contributorFields";
import { intakeImagePaths, upgradeLinks } from "@/lib/intake/upgradeToken";

const IMAGE_BUCKET = "event-images";

type Admin = SupabaseClient;

export async function deleteUpgradeImages(admin: Admin, paths: Array<string | null | undefined>): Promise<void> {
  const clean = intakeImagePaths(paths);
  if (!clean.length) return;
  await admin.storage
    .from(IMAGE_BUCKET)
    .remove(clean)
    .catch(() => {});
}

export async function clearUpgradeImageColumns(admin: Admin, requestIds: string[]): Promise<void> {
  const ids = requestIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!ids.length) return;
  const { error } = await admin.rpc("clear_intake_upgrade_storage", { _ids: ids });
  if (error) console.error("[intake-upgrade] clear storage columns", error.code ?? "error");
}

/** Delete leftover images and tell the admin, only when the database just flagged the row. */
export async function settleFlaggedUpgrade(
  admin: Admin,
  row: {
    request_id?: unknown;
    logo_storage_path?: unknown;
    cover_storage_path?: unknown;
    notify_admin?: unknown;
    display_name?: unknown;
  },
  outcome: "declined" | "expired",
): Promise<void> {
  const requestId = typeof row.request_id === "string" ? row.request_id : "";
  const paths = [row.logo_storage_path, row.cover_storage_path].filter((p): p is string => typeof p === "string");
  if (paths.length) {
    await deleteUpgradeImages(admin, paths);
    if (requestId) await clearUpgradeImageColumns(admin, [requestId]);
  }
  await sendUpgradeFlag({ notify: row.notify_admin, name: row.display_name, outcome, requestId });
}

/** One admin email when the database says this request was just flagged. No account address. */
export async function sendUpgradeFlag(input: { notify: unknown; name: unknown; outcome: "declined" | "expired"; requestId: unknown }): Promise<void> {
  if (input.notify !== true) return;
  const to = adminNotifyEmail();
  const name = typeof input.name === "string" ? input.name : "A listing";
  const requestId = typeof input.requestId === "string" ? input.requestId : "";
  if (!to || !requestId) return;
  await sendEmail({ to, ...intakeUpgradeFlagEmail({ name, outcome: input.outcome, requestId }) });
}

export function upgradeEmail(input: { name: string; origin: string; rawToken: string; expiresAt: string }) {
  const links = upgradeLinks(input.origin, input.rawToken);
  const expiresOn = formatExpiry(input.expiresAt);
  return intakeUpgradeEmail({ name: input.name, confirmUrl: links.confirm, declineUrl: links.decline, expiresOn });
}

function formatExpiry(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "in 7 days";
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" }).format(date);
}

export async function sendOwnerWelcome(input: {
  to: string | null | undefined;
  name: string;
  slug: string;
  onMap: boolean;
  request: Request;
}): Promise<"sent" | "failed" | "skipped"> {
  const origin = siteOrigin(input.request);
  if (!input.to) return "skipped";
  return sendEmail({
    to: input.to,
    ...ownerWelcomeEmail({
      name: input.name,
      ownerEmail: input.to,
      listingUrl: `${origin}/c/${input.slug}`,
      signInUrl: `${origin}/dashboard`,
      onMap: input.onMap,
    }),
  });
}

export function onMapFromRow(row: { no_fixed_location?: unknown; physical_latitude?: unknown; physical_longitude?: unknown }): boolean {
  return hasMapPin({
    no_fixed_location: row.no_fixed_location === true,
    physical_latitude: row.physical_latitude,
    physical_longitude: row.physical_longitude,
  });
}
