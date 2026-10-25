/**
 * GET /api/automation/sources
 *
 * What the (Phase 2) Reader should look at now. Server-to-server only: the caller sends
 * `Authorization: Bearer cck_...`, an API key with the scope `automation:suggest` (the same
 * gate, limiter and key as POST /api/automation/suggestions, because it is the same job). No
 * key, or a key without that scope, gets 401 / 403 and nothing is read.
 *
 * Returns `{ sources: [{ source_id, contributor_id, kind, url, last_status }], count }`:
 * enabled sources of a readable kind (website, youtube, calendar) at an https address that are
 * DUE (never checked, or last checked more than 20 hours ago), and only for Contributors who
 * pass lib/automation/eligibility.ts (approved, visible, not deleted, automation not 'off'),
 * the same rule the suggestions route enforces. Oldest check first, at most 200. Nothing
 * private is returned: no names, no emails, no consent detail.
 *
 * Read-only. The "last checked" line is written by POST /api/automation/suggestions, so a
 * source the Reader could not reach is simply offered again on its next run.
 *
 * Uses the service-role client on purpose: the authorisation is the scoped API key, and the
 * consent level it filters on is a private column that is never returned.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasScope } from "@/lib/apiKey";
import { gateV1 } from "@/lib/v1Gate";
import { READABLE_SOURCE_KINDS } from "@/lib/automation/suggestions";
import { ELIGIBLE_LEVELS, contributorEligibility, type ProfileForAutomation } from "@/lib/automation/eligibility";
import { MAX_SOURCES_PER_RUN, dueCutoff, pickDueSources, type SourceRow } from "@/lib/automation/dueSources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUGGEST_SCOPE = "automation:suggest";
/** Contributors with automation on. A handful today; this is a ceiling, not a target. */
const MAX_ELIGIBLE_CONTRIBUTORS = 5000;
/** Due rows read per page, oldest check first; more pages only while ineligible rows crowd a page. */
const PAGE = 500;
const MAX_PAGES = 5;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const gate = await gateV1(request, { bucket: "automation-suggestions" });
  if (gate.deny) return gate.deny;
  if (!gate.key) return json({ error: "unauthorized" }, 401);
  if (!hasScope(gate.key, SUGGEST_SCOPE)) return json({ error: "forbidden" }, 403);

  const admin = createAdminClient();
  const now = new Date();

  // 1. Who may be read. The database narrows; the shared rule decides (it also drops hidden and deleted).
  const { data: profiles, error: profilesErr } = await admin
    .from("profiles")
    .select("id, role, contributor_status, contributor_hidden, deleted_at, auto_update_level")
    .eq("role", "contributor")
    .eq("contributor_status", "approved")
    .in("auto_update_level", [...ELIGIBLE_LEVELS])
    .limit(MAX_ELIGIBLE_CONTRIBUTORS);
  if (profilesErr) {
    console.error("[/api/automation/sources] profiles", profilesErr);
    return json({ error: "read_failed" }, 500);
  }
  const eligible = new Set<string>();
  for (const p of (profiles ?? []) as (ProfileForAutomation & { id: string })[]) {
    if ("level" in contributorEligibility(p)) eligible.add(p.id);
  }

  // 2. Their due sources, oldest check first, a page at a time until 200 are found.
  const rows: SourceRow[] = [];
  let sources = pickDueSources(rows, eligible, now);
  const cutoff = dueCutoff(now).toISOString();
  for (let page = 0; eligible.size > 0 && page < MAX_PAGES && sources.length < MAX_SOURCES_PER_RUN; page++) {
    const { data, error } = await admin
      .from("listing_sources")
      .select("id, contributor_id, kind, url, enabled, last_checked_at, last_status")
      .eq("enabled", true)
      .in("kind", [...READABLE_SOURCE_KINDS])
      .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
      .order("last_checked_at", { ascending: true, nullsFirst: true })
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      console.error("[/api/automation/sources] sources", error);
      return json({ error: "read_failed" }, 500);
    }
    const batch = (data ?? []) as SourceRow[];
    rows.push(...batch);
    sources = pickDueSources(rows, eligible, now);
    if (batch.length < PAGE) break;
  }

  console.info("[/api/automation/sources]", { key: gate.key.raw_prefix, eligible: eligible.size, due: sources.length });
  return json({ sources, count: sources.length });
}
