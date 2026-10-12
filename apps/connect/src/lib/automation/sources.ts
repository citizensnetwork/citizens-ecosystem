/**
 * Listing automation: the sources a Contributor lists on the Google Form become
 * `listing_sources` rows. Pure, so the intake route stays thin and every shape a
 * person types into a social box is tested.
 *
 * A source is always an https URL. Meta and TikTok pages can be listed but never
 * switched on (the reader cannot read them without the page owner connecting an
 * account), which the table's CHECK also enforces.
 */

import { READABLE_SOURCE_KINDS, httpsUrlOrNull, type SourceKind } from "@/lib/automation/suggestions";

export type SourceRow = { kind: SourceKind; url: string; enabled: boolean };

/** What the Form gave us, already normalised by parseListingFields (handles or links). */
export type ListingSourceInput = {
  websiteUrl?: string | null;
  youtube?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
};

const HANDLE = /^[A-Za-z0-9._-]{1,60}$/;

/** "http://x.example" -> "https://x.example"; anything with another scheme is refused. */
function toHttps(value: string): string | null {
  const t = value.trim();
  if (/^http:\/\//i.test(t)) return httpsUrlOrNull("https://" + t.slice(7));
  if (/^https:\/\//i.test(t)) return httpsUrlOrNull(t);
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null; // javascript:, data:, ftp: ...
  return null;
}

/** A link, or a bare handle turned into the platform's page URL. */
function platformUrl(value: string | null | undefined, build: (handle: string) => string): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.includes("/")) {
    const url = toHttps(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : "https://" + v);
    return url;
  }
  const handle = v.replace(/^@/, "");
  return HANDLE.test(handle) ? httpsUrlOrNull(build(handle)) : null;
}

/**
 * The source rows for a new listing. `enabled` follows the owner's consent: on only when
 * the level is not 'off' AND the platform is one the reader can read.
 */
export function sourcesFromListing(input: ListingSourceInput, consentOn: boolean): SourceRow[] {
  const candidates: { kind: SourceKind; url: string | null }[] = [
    { kind: "website", url: input.websiteUrl ? toHttps(input.websiteUrl) : null },
    { kind: "youtube", url: platformUrl(input.youtube, (h) => `https://www.youtube.com/@${h}`) },
    { kind: "facebook", url: platformUrl(input.facebook, (h) => `https://www.facebook.com/${h}`) },
    { kind: "instagram", url: platformUrl(input.instagram, (h) => `https://www.instagram.com/${h}/`) },
    { kind: "tiktok", url: platformUrl(input.tiktok, (h) => `https://www.tiktok.com/@${h}`) },
  ];
  // One candidate per kind, so there is nothing to de-duplicate (the table is unique on
  // owner + kind + url anyway).
  const rows: SourceRow[] = [];
  for (const c of candidates) {
    if (!c.url) continue;
    rows.push({ kind: c.kind, url: c.url, enabled: consentOn && READABLE_SOURCE_KINDS.includes(c.kind) });
  }
  return rows;
}
