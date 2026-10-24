/**
 * GET /api/automation/sources
 *
 * What the (Phase 2) Reader should look at now. Server-to-server only: the caller sends
 * `Authorization: Bearer cck_...`, an API key with the scope `automation:suggest` (the same
 * gate as POST /api/automation/suggestions, because it is the same job). No key, or a key
 * without that scope, gets 401 / 403 and nothing is read.
 *
 * Returns `{ sources: [{ source_id, contributor_id, kind, url, last_status }], count }`:
 * enabled sources of a readable kind (website, youtube, calendar) at an https address, that
 * are DUE (never checked, or last checked more than 20 hours ago), and only for Contributors
 * who are approved, visible, not deleted and whose automation level is not 'off'. Oldest
 * check first, at most 200. Nothing private is returned: no names, no emails, no consent
 * detail. Who may be read is decided by lib/automation/dueSources.ts, the same rule the
 * suggestions route applies, so the Reader is never handed a source that route would refuse.
 *
 * Read-only. The "last checked" line is written by POST /api/automation/suggestions, so a
 * source the Reader could not reach is simply offered again on its next run.
 *
 * Uses the service-role client on purpose: the authorisation is the scoped API key, and the
 * consent level it reads is a private column.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasScope } from "@/lib/apiKey";
import { gateV1 } from "@/lib/v1Gate";
import { READABLE_SOURCE_KINDS } from "@/lib/automation/suggestions";
import {
  MAX_SOURCES_PER_RUN,
  contributorEligibility,
  isDue,
  pickDueSources,
  type ProfileForAutomation,
  type SourceRow,
} from "@/lib/automation/dueSources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUGGEST_SCOPE = "automation:suggest";
/** Contributors with automation on. A few dozen today; this is a ceiling, not a target. */
const MAX_ELIGIBLE_CONTRIBUTORS = 5000;
/** Rows read per page, oldest check first. */
const PAGE = 500;
const MAX_PAGES = 10;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const gate = await gateV1(request, { bucket: "automation-sources" });
  if (gate.deny) return gate.deny;
  if (!gate.key) return json({ error: "unauthorized" }, 401);
  if (!hasScope(gate.key, SUGGEST_SCOPE)) return json({ error: "forbidden" }, 403);

  const admin = createAdminClient();
  const now = new Date();

  // 1. Who has opted in. The database narrows to approved Contributors with a level other than
  //    'off'; the shared rule then also drops hidden and deleted ones.
  const { data: profiles, error: profilesErr } = await admin
    .from("profiles")
    .select("id, role, contributor_status, contributor_hidden, deleted_at, auto_update_level")
    .eq("role", "contributor")
    .eq("contributor_status", "approved")
    .in("auto_update_level", ["suggest", "events_auto"])
    .limit(MAX_ELIGIBLE_CONTRIBUTORS);
  if (profilesErr) {
    console.error("[/api/automation/sources] profiles", profilesErr);
    return json({ error: "read_failed" }, 500);
  }
  const eligible = new Set<string>();
  for (const p of (profiles ?? []) as (ProfileForAutomation & { id: string })[]) {
    if ("level" in contributorEligibility(p)) eligible.add(p.id);
  }
  if (eligible.size === 0) {
    console.info("[/api/automation/sources]", { key: gate.key.raw_prefix, eligible: 0, due: 0 });
    return json({ sources: [], count: 0 });
  }

  // 2. Their sources, oldest check first, a page at a time. Because of that order the scan
  //    stops as soon as a page reaches a source that is not due yet.
  const rows: SourceRow[] = [];
  let due = 0;
  for (let page = 0; page < MAX_PAGES && due < MAX_SOURCES_PER_RUN; page++) {
    const { data, error } = await admin
      .from("listing_sources")
      .select("id, contributor_id, kind, url, enabled, last_checked_at, last_status")
      .eq("enabled", true)
      .in("kind", [...READABLE_SOURCE_KINDS])
      .order("last_checked_at", { ascending: true, nullsFirst: true })
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      console.error("[/api/automation/sources] sources", error);
      return json({ error: "read_failed" }, 500);
    }
    const batch = (data ?? []) as SourceRow[];
    rows.push(...batch);
    due = pickDueSources(rows, eligible, now).length;
    const last = batch[batch.length - 1];
    if (batch.length < PAGE || (last && !isDue(last.last_checked_at, now))) break;
  }

  const sources = pickDueSources(rows, eligible, now);
  console.info("[/api/automation/sources]", {
    key: gate.key.raw_prefix,
    eligible: eligible.size,
    due: sources.length,
  });
  return json({ sources, count: sources.length });
}
