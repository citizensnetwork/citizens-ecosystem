/**
 * Listing automation, Phase 2: which sources the Reader should look at now.
 *
 * Pure (no I/O), so every rule is unit-tested. GET /api/automation/sources narrows the rows in
 * the database and then hands them here, and this is the final word: a source that is off, of
 * a kind the Reader cannot read, at a non-https address, belonging to a Contributor who is not
 * eligible (lib/automation/eligibility.ts), or checked recently never leaves the server.
 */

import { READABLE_SOURCE_KINDS, httpsUrlOrNull, type SourceKind } from "@/lib/automation/suggestions";

/** A daily run drifts a little, so "due" is a bit under 24 hours. */
export const SOURCE_DUE_AFTER_HOURS = 20;
/** At most this many sources per run; the oldest-checked come first, the rest wait a day. */
export const MAX_SOURCES_PER_RUN = 200;

export type SourceRow = {
  id: string;
  contributor_id: string;
  kind: string;
  url: string;
  enabled: boolean;
  last_checked_at: string | null;
  last_status: string | null;
};

/** What the Reader is told about a source. No private data: no names, no emails, no consent detail. */
export type ReaderSource = {
  source_id: string;
  contributor_id: string;
  kind: SourceKind;
  url: string;
  last_status: string | null;
};

/** The instant before which a check counts as stale. */
export function dueCutoff(now: Date): Date {
  return new Date(now.getTime() - SOURCE_DUE_AFTER_HOURS * 3_600_000);
}

/** Never checked (or an unreadable time), or last checked more than SOURCE_DUE_AFTER_HOURS ago. */
export function isDue(lastCheckedAt: string | null | undefined, now: Date): boolean {
  if (!lastCheckedAt) return true;
  const t = Date.parse(lastCheckedAt);
  if (!Number.isFinite(t)) return true;
  return t < dueCutoff(now).getTime();
}

const checkedAt = (row: SourceRow): number => {
  const t = row.last_checked_at ? Date.parse(row.last_checked_at) : Number.NaN;
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
};

/**
 * Of `rows`, the sources to read now, oldest check first (never-checked first of all), then by id
 * so the order is stable. A source id seen twice is kept once. At most `cap`.
 */
export function pickDueSources(
  rows: readonly SourceRow[],
  eligibleContributors: ReadonlySet<string>,
  now: Date,
  cap: number = MAX_SOURCES_PER_RUN,
): ReaderSource[] {
  const seen = new Set<string>();
  const picked: { row: SourceRow; url: string }[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    if (row.enabled !== true || !(READABLE_SOURCE_KINDS as readonly string[]).includes(row.kind)) continue;
    if (!eligibleContributors.has(row.contributor_id) || !isDue(row.last_checked_at, now)) continue;
    const url = httpsUrlOrNull(row.url);
    if (!url) continue;
    seen.add(row.id);
    picked.push({ row, url });
  }
  picked.sort((a, b) => checkedAt(a.row) - checkedAt(b.row) || (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0));
  return picked.slice(0, Math.max(0, cap)).map(({ row, url }) => ({
    source_id: row.id,
    contributor_id: row.contributor_id,
    kind: row.kind as SourceKind,
    url,
    last_status: row.last_status,
  }));
}
