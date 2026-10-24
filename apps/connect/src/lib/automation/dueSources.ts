/**
 * Listing automation, Phase 2: which sources the Reader should look at now.
 *
 * Pure (no I/O) so every rule is unit-tested. GET /api/automation/sources reads the rows
 * and hands them here; the Reader (apps/connect/scripts/reader) only ever sees what this
 * returns, so a source that is off, belongs to a Contributor who has not opted in, or was
 * looked at recently never leaves the server.
 *
 * "Eligible" is one definition shared with POST /api/automation/suggestions, so the Reader
 * is never sent a source that route would then refuse.
 */

import { READABLE_SOURCE_KINDS, httpsUrlOrNull, isAutoUpdateLevel, type AutoUpdateLevel, type SourceKind } from "@/lib/automation/suggestions";

/** A daily run drifts a little, so "due" is a bit under 24 hours. */
export const SOURCE_DUE_AFTER_HOURS = 20;
/** At most this many sources per run; the oldest-checked come first, the rest wait a day. */
export const MAX_SOURCES_PER_RUN = 200;

export type ProfileForAutomation = {
  role?: string | null;
  contributor_status?: string | null;
  contributor_hidden?: boolean | null;
  deleted_at?: string | null;
  auto_update_level?: string | null;
};

export type Eligibility = { level: AutoUpdateLevel } | { reason: "contributor_not_eligible" | "consent_off" };

/**
 * Whether a profile may receive suggestions, and at which level: an approved, visible,
 * undeleted Contributor whose automation level is not 'off'. A missing profile, or an
 * unrecognised level, counts as not eligible.
 */
export function contributorEligibility(p: ProfileForAutomation | null | undefined): Eligibility {
  if (!p || p.role !== "contributor" || p.contributor_status !== "approved" || p.contributor_hidden || p.deleted_at) {
    return { reason: "contributor_not_eligible" };
  }
  if (!isAutoUpdateLevel(p.auto_update_level) || p.auto_update_level === "off") return { reason: "consent_off" };
  return { level: p.auto_update_level };
}

export type SourceRow = {
  id: string;
  contributor_id: string;
  kind: string;
  url: string;
  enabled: boolean;
  last_checked_at: string | null;
  last_status: string | null;
};

/** What the Reader is told about a source. No private data: no names, no emails. */
export type ReaderSource = {
  source_id: string;
  contributor_id: string;
  kind: SourceKind;
  url: string;
  last_status: string | null;
};

/** Never checked, or last checked more than SOURCE_DUE_AFTER_HOURS ago. */
export function isDue(lastCheckedAt: string | null | undefined, now: Date): boolean {
  if (!lastCheckedAt) return true;
  const t = Date.parse(lastCheckedAt);
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t > SOURCE_DUE_AFTER_HOURS * 3_600_000;
}

/**
 * Of `rows`, the sources to read now: enabled, of a kind the Reader can read, at an https
 * address, owned by an eligible Contributor, and due. Oldest check first (never-checked
 * first of all), then by id so the order is stable. At most `cap`.
 */
export function pickDueSources(
  rows: readonly SourceRow[],
  eligibleContributors: ReadonlySet<string>,
  now: Date,
  cap: number = MAX_SOURCES_PER_RUN,
): ReaderSource[] {
  const picked: { row: SourceRow; url: string; checked: number }[] = [];
  for (const row of rows) {
    if (!row.enabled || !(READABLE_SOURCE_KINDS as readonly string[]).includes(row.kind)) continue;
    if (!eligibleContributors.has(row.contributor_id)) continue;
    if (!isDue(row.last_checked_at, now)) continue;
    const url = httpsUrlOrNull(row.url);
    if (!url) continue;
    const parsed = row.last_checked_at ? Date.parse(row.last_checked_at) : Number.NEGATIVE_INFINITY;
    picked.push({ row, url, checked: Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY });
  }
  picked.sort((a, b) => (a.checked === b.checked ? (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0) : a.checked < b.checked ? -1 : 1));
  return picked.slice(0, Math.max(0, cap)).map(({ row, url }) => ({
    source_id: row.id,
    contributor_id: row.contributor_id,
    kind: row.kind as SourceKind,
    url,
    last_status: row.last_status,
  }));
}
