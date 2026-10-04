/**
 * POST /api/automation/suggestions
 *
 * Where the (Phase 2) reader hands in what it found on a Contributor's public
 * website, YouTube channel or calendar. Server-to-server only: the caller sends
 * `Authorization: Bearer cck_...`, an API key minted by an admin with the scope
 * `automation:suggest` (POST /api/admin/api-keys). No key, or a key without that
 * scope, gets 401 / 403 and nothing is read.
 *
 * Body: one item, or `{ items: [...] }` (at most 50):
 *   { contributor_id, source_id?, kind: 'event'|'news'|'profile', source_url, payload }
 * A request-level `contributor_id`, `source_id` and `source_url` are defaults for
 * items that do not carry their own. `source_status` (optional, <= 200 chars) is
 * written to the source's "last checked" line; an empty `items` with a `source_id`
 * records a check that found nothing.
 *
 * The rules, in order, per item (the reader is never trusted):
 *   1. the Contributor exists, is approved, not hidden, not deleted
 *   2. their automation level is not 'off'                       -> consent_off
 *   3. the source (if named) is theirs and enabled               -> source_disabled
 *   4. the payload passes lib/automation/suggestions.ts: a strict per-kind schema,
 *      an allow-list of fields, https links only, phone numbers and emails scrubbed
 *   5. the fingerprint is new for this Contributor               -> duplicate (200)
 *   6. a FUTURE event at level 'events_auto' is published straight away (the same
 *      row the dashboard's create-event path writes, plus events.source_url) and
 *      the suggestion is stored as 'auto_published'; everything else is 'pending'
 *
 * Response: `{ results: [{ index, status, id?, reason?, warnings? }] }`, where status is
 * 'pending' | 'auto_published' | 'duplicate' | 'rejected'. A batch is always 200 with
 * per-item results. A single (non-batch) item that is refused answers 409
 * (consent_off, source_disabled, contributor_not_eligible), 422 (invalid payload) or 429.
 *
 * Uses the service-role client on purpose: the authorisation is the scoped API key plus
 * the rules above, and the tables it writes (listing_suggestions) have no client insert path.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasScope } from "@/lib/apiKey";
import { gateV1 } from "@/lib/v1Gate";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidUUID } from "@/lib/validation";
import { geocodeWithMapTiler } from "@/lib/intake/googleForm";
import {
  MAX_ITEMS_PER_REQUEST,
  isAutoPublishable,
  isAutoUpdateLevel,
  validateSuggestion,
  type AutoUpdateLevel,
  type EventPayload,
} from "@/lib/automation/suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUGGEST_SCOPE = "automation:suggest";

/** 50 items x up to 16 KB each, with headroom. */
const MAX_BODY_CHARS = 1_000_000;
const MAX_STATUS = 200;
/** A runaway reader cannot flood one Contributor's inbox: new items per hour. */
const PER_CONTRIBUTOR_PER_HOUR = 100;

type ItemResult = {
  index: number;
  status: "pending" | "auto_published" | "duplicate" | "rejected";
  id?: string;
  reason?: string;
  warnings?: string[];
};

type Eligibility = { level: AutoUpdateLevel } | { reason: "contributor_not_eligible" | "consent_off" };

/** The refusals a lone item turns into an HTTP 409 (a batch just reports them per item). */
const CONFLICT_REASONS = new Set(["consent_off", "source_disabled", "contributor_not_eligible"]);

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export async function POST(request: Request) {
  const gate = await gateV1(request, { bucket: "automation-suggestions" });
  if (gate.deny) return gate.deny;
  if (!gate.key) return json({ error: "unauthorized" }, 401);
  if (!hasScope(gate.key, SUGGEST_SCOPE)) return json({ error: "forbidden" }, 403);

  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return json({ error: "payload_too_large" }, 413);
  let top: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) throw new Error("not an object");
    top = parsed;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const isBatch = Array.isArray(top.items);
  const rawItems: unknown[] = isBatch ? (top.items as unknown[]) : [top];
  if (rawItems.length > MAX_ITEMS_PER_REQUEST) {
    return json({ error: "too_many_items", max: MAX_ITEMS_PER_REQUEST }, 400);
  }
  const defaultSourceId = typeof top.source_id === "string" ? top.source_id : null;
  const sourceStatus = typeof top.source_status === "string" ? top.source_status.trim().slice(0, MAX_STATUS) : null;

  const admin = createAdminClient();
  const now = new Date();
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/+$/, "");

  const eligibility = new Map<string, Eligibility>();
  async function eligibilityOf(contributorId: string): Promise<Eligibility> {
    const cached = eligibility.get(contributorId);
    if (cached) return cached;
    const { data } = await admin
      .from("profiles")
      .select("id, role, contributor_status, contributor_hidden, deleted_at, auto_update_level")
      .eq("id", contributorId)
      .maybeSingle();
    const p = data as {
      role?: string;
      contributor_status?: string;
      contributor_hidden?: boolean;
      deleted_at?: string | null;
      auto_update_level?: string;
    } | null;
    let result: Eligibility;
    if (!p || p.role !== "contributor" || p.contributor_status !== "approved" || p.contributor_hidden || p.deleted_at) {
      result = { reason: "contributor_not_eligible" };
    } else if (!isAutoUpdateLevel(p.auto_update_level) || p.auto_update_level === "off") {
      result = { reason: "consent_off" };
    } else {
      result = { level: p.auto_update_level };
    }
    eligibility.set(contributorId, result);
    return result;
  }

  const sources = new Map<string, { contributor_id: string; enabled: boolean } | null>();
  async function sourceOf(sourceId: string) {
    if (sources.has(sourceId)) return sources.get(sourceId) ?? null;
    const { data } = await admin.from("listing_sources").select("id, contributor_id, enabled").eq("id", sourceId).maybeSingle();
    const row = (data as { contributor_id: string; enabled: boolean } | null) ?? null;
    sources.set(sourceId, row);
    return row;
  }

  const results: ItemResult[] = [];
  const touchedSources = new Map<string, string>(); // source id -> its contributor id

  for (let index = 0; index < rawItems.length; index++) {
    const item = rawItems[index];
    const reject = (reason: string, warnings?: string[]): ItemResult => ({ index, status: "rejected", reason, ...(warnings?.length ? { warnings } : {}) });
    if (!isObject(item)) {
      results.push(reject("item_must_be_an_object"));
      continue;
    }

    const contributorId = typeof item.contributor_id === "string" ? item.contributor_id : typeof top.contributor_id === "string" ? top.contributor_id : "";
    if (!isValidUUID(contributorId)) {
      results.push(reject("invalid_contributor_id"));
      continue;
    }
    const sourceId = typeof item.source_id === "string" ? item.source_id : defaultSourceId;
    if (sourceId !== null && !isValidUUID(sourceId)) {
      results.push(reject("invalid_source_id"));
      continue;
    }

    // 1 + 2: who may receive suggestions at all.
    const who = await eligibilityOf(contributorId);
    if ("reason" in who) {
      results.push(reject(who.reason));
      continue;
    }
    // 3: the named source is theirs and switched on.
    if (sourceId !== null) {
      const src = await sourceOf(sourceId);
      if (!src || src.contributor_id !== contributorId || !src.enabled) {
        results.push(reject("source_disabled"));
        continue;
      }
      touchedSources.set(sourceId, contributorId);
    }

    // 4: the payload.
    const checked = validateSuggestion(item.kind, item.payload, item.source_url ?? top.source_url, now);
    if (!checked.ok) {
      results.push(reject(checked.reason));
      continue;
    }

    const rl = await checkRateLimit(`automation-contributor:${contributorId}`, { limit: PER_CONTRIBUTOR_PER_HOUR, windowMs: 3_600_000 });
    if (!rl.success) {
      results.push(reject("rate_limited"));
      continue;
    }

    // 5: dedupe across days. A conflict inserts nothing and returns no row.
    const { data: inserted, error: insertErr } = await admin
      .from("listing_suggestions")
      .upsert(
        {
          contributor_id: contributorId,
          source_id: sourceId,
          kind: checked.kind,
          payload: checked.payload,
          source_url: checked.sourceUrl,
          fingerprint: checked.fingerprint,
          status: "pending",
        },
        { onConflict: "contributor_id,fingerprint", ignoreDuplicates: true },
      )
      .select("id");
    if (insertErr) {
      console.error("[/api/automation/suggestions] insert", insertErr);
      results.push(reject("store_failed"));
      continue;
    }
    const row = (inserted as { id: string }[] | null)?.[0];
    if (!row) {
      results.push({ index, status: "duplicate", ...(checked.warnings.length ? { warnings: checked.warnings } : {}) });
      continue;
    }

    // 6: events at 'events_auto' go live now (a future event only).
    const warnings = [...checked.warnings];
    if (checked.kind === "event" && isAutoPublishable(who.level, { kind: "event", payload: checked.payload }, now)) {
      const published = await publishEvent(admin, contributorId, checked.payload, checked.sourceUrl, origin);
      if (published) {
        await admin
          .from("listing_suggestions")
          .update({ status: "auto_published", published_ref: published, decided_at: now.toISOString() })
          .eq("id", row.id)
          .eq("status", "pending");
        results.push({ index, status: "auto_published", id: row.id, ...(warnings.length ? { warnings } : {}) });
        continue;
      }
      warnings.push("Automatic publishing failed, so this event is waiting for the owner's approval.");
    }
    results.push({ index, status: "pending", id: row.id, ...(warnings.length ? { warnings } : {}) });
  }

  // The dashboard's "last checked" line.
  for (const [sourceId, contributorId] of touchedSources) {
    await admin
      .from("listing_sources")
      .update({ last_checked_at: now.toISOString(), last_status: sourceStatus ?? "ok" })
      .eq("id", sourceId)
      .eq("contributor_id", contributorId);
  }
  // An empty batch that only reports a check on a source.
  if (rawItems.length === 0 && defaultSourceId && isValidUUID(defaultSourceId)) {
    await admin
      .from("listing_sources")
      .update({ last_checked_at: now.toISOString(), last_status: sourceStatus ?? "ok" })
      .eq("id", defaultSourceId);
  }

  const tally = results.reduce<Record<string, number>>((t, r) => ((t[r.status] = (t[r.status] ?? 0) + 1), t), {});
  console.info("[/api/automation/suggestions]", { key: gate.key.raw_prefix, items: rawItems.length, ...tally });

  if (!isBatch && results[0]?.status === "rejected") {
    const reason = results[0].reason ?? "rejected";
    const status = CONFLICT_REASONS.has(reason) ? 409 : reason === "rate_limited" ? 429 : reason === "store_failed" ? 500 : 422;
    return json({ error: reason, results }, status);
  }
  return json({ results });
}

/**
 * The same row the dashboard's create-event path writes, for the Contributor, plus where it
 * came from. Coordinates are best-effort exactly as there: an address MapTiler cannot place
 * simply leaves the event off the map (it is still listed). Returns the new event's id, or
 * null (the suggestion then stays pending for the owner).
 */
async function publishEvent(
  admin: ReturnType<typeof createAdminClient>,
  contributorId: string,
  event: EventPayload,
  sourceUrl: string,
  origin: string,
): Promise<string | null> {
  const point = event.location
    ? await geocodeWithMapTiler(event.location, { key: process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "", referer: `${origin}/` })
    : null;
  const { data, error } = await admin
    .from("events")
    .insert({
      title: event.title,
      description: event.description,
      category: event.category,
      date: event.start,
      end_time: event.end,
      location: event.location,
      created_by: contributorId,
      website_url: event.website_url,
      latitude: point ? point.lat : null,
      longitude: point ? point.lng : null,
      source_url: sourceUrl,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[/api/automation/suggestions] auto-publish", error);
    return null;
  }
  return (data as { id: string }).id;
}
