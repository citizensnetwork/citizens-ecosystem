/**
 * POST /api/automation/digest
 *
 * The "you have new suggestions" email (listing automation, Phase 1, brief §6). The
 * reader's daily run (Phase 2) calls this once it has posted, or any scheduler can:
 * `Authorization: Bearer cck_...` with an admin-minted key that has the scope
 * `automation:digest` (no key / wrong scope: 401 / 403).
 *
 * Who gets one, at most ONCE A DAY:
 *   - an approved, visible Contributor whose automation level is not 'off'
 *   - with at least one PENDING suggestion created since their last nudge (an
 *     automatically published event alone never triggers an email)
 *   - who has not switched off `notification_prefs.contributor_updates`
 *   - who was not already nudged in the last 20 hours (a daily run drifts a little)
 * The nudge time is stored (profiles.auto_update_nudged_at) only after the email was
 * actually SENT, so a mail outage retries on the next run instead of going silent.
 *
 * The email says how many suggestions are waiting and links to the dashboard; it never
 * contains the suggestions themselves. Response: counts only, no addresses.
 *
 * Service-role client on purpose: the key above is the authorisation, and the columns
 * read (email, notification prefs, the consent level) are private.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasScope } from "@/lib/apiKey";
import { gateV1 } from "@/lib/v1Gate";
import { sendEmail, siteOrigin } from "@/lib/email/send";
import { suggestionsDigestEmail } from "@/lib/email/automationTemplates";
import { isAutoUpdateLevel } from "@/lib/automation/suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIGEST_SCOPE = "automation:digest";
/** Look back this far for pending suggestions; anything older was nudged long ago or is stale. */
const LOOKBACK_DAYS = 7;
/** At most this many Contributors per run (the rest are picked up by the next run). */
const MAX_PER_RUN = 200;
/** "Once a day", with slack for a scheduler that drifts. */
const MIN_HOURS_BETWEEN = 20;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  notification_email: string | null;
  role: string | null;
  contributor_status: string | null;
  contributor_hidden: boolean | null;
  deleted_at: string | null;
  auto_update_level: string | null;
  auto_update_nudged_at: string | null;
  notification_prefs: { contributor_updates?: unknown } | null;
};

export async function POST(request: Request) {
  const gate = await gateV1(request, { bucket: "automation-digest" });
  if (gate.deny) return gate.deny;
  if (!gate.key) return json({ error: "unauthorized" }, 401);
  if (!hasScope(gate.key, DIGEST_SCOPE)) return json({ error: "forbidden" }, 403);

  const admin = createAdminClient();
  const now = new Date();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();

  const { data: pending, error } = await admin
    .from("listing_suggestions")
    .select("contributor_id, created_at")
    .eq("status", "pending")
    .gte("created_at", since)
    .limit(5000);
  if (error) {
    console.error("[/api/automation/digest] read", error);
    return json({ error: "read_failed" }, 500);
  }

  // New pending suggestions per Contributor.
  const byContributor = new Map<string, string[]>();
  for (const row of (pending ?? []) as { contributor_id: string; created_at: string }[]) {
    const list = byContributor.get(row.contributor_id) ?? [];
    list.push(row.created_at);
    byContributor.set(row.contributor_id, list);
  }

  const origin = siteOrigin(request);
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => void (skipped[reason] = (skipped[reason] ?? 0) + 1);
  let sent = 0;
  let failed = 0;
  let considered = 0;

  for (const [contributorId, createdAts] of byContributor) {
    if (considered >= MAX_PER_RUN) break;
    considered++;

    const { data } = await admin
      .from("profiles")
      .select(
        "id, full_name, email, notification_email, role, contributor_status, contributor_hidden, deleted_at, auto_update_level, auto_update_nudged_at, notification_prefs",
      )
      .eq("id", contributorId)
      .maybeSingle();
    const p = data as Profile | null;
    if (!p || p.role !== "contributor" || p.contributor_status !== "approved" || p.contributor_hidden || p.deleted_at) {
      skip("not_eligible");
      continue;
    }
    if (!isAutoUpdateLevel(p.auto_update_level) || p.auto_update_level === "off") {
      skip("automation_off");
      continue;
    }
    if (p.notification_prefs && p.notification_prefs.contributor_updates === false) {
      skip("opted_out");
      continue;
    }
    const nudgedAt = p.auto_update_nudged_at ? Date.parse(p.auto_update_nudged_at) : null;
    if (nudgedAt !== null && now.getTime() - nudgedAt < MIN_HOURS_BETWEEN * 3_600_000) {
      skip("too_soon");
      continue;
    }
    const fresh = createdAts.filter((t) => nudgedAt === null || Date.parse(t) > nudgedAt).length;
    if (fresh === 0) {
      skip("nothing_new");
      continue;
    }

    const mail = suggestionsDigestEmail({
      name: p.full_name?.trim() || "Your listing",
      count: fresh,
      url: `${origin}/dashboard/suggestions`,
    });
    const outcome = await sendEmail({ to: p.notification_email || p.email || "", ...mail });
    if (outcome === "sent") {
      sent++;
      const { error: stampErr } = await admin
        .from("profiles")
        .update({ auto_update_nudged_at: now.toISOString() })
        .eq("id", contributorId);
      if (stampErr) console.error("[/api/automation/digest] stamp", stampErr);
    } else if (outcome === "failed") {
      failed++;
    } else {
      skip("not_sent");
    }
  }

  console.info("[/api/automation/digest]", { considered, sent, failed, skipped });
  return json({ considered, sent, failed, skipped });
}
