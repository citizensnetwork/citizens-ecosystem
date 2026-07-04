// Stage I: shared validators for planning-card extension fields
// (checklist, links, assigned_place_ids). Used by both the tasks and ideas
// API routes so the rules stay in lockstep.
//
// All validators return server-safe shapes — never throw. They cap collection
// sizes, normalise text, and refuse anything that isn't already shaped right
// rather than trying to coerce.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidUUID } from "@/lib/validation";

const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;
const HTTP_URL_RE = /^https?:\/\/[^\s]+$/i;

const MAX_CHECKLIST = 50;
const MAX_LINKS = 20;
const MAX_PLACES = 10;
const MAX_CHECKLIST_TEXT = 200;
const MAX_LINK_URL = 500;
const MAX_LINK_LABEL = 120;

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface LinkItem {
  url: string;
  label: string;
}

/** Validate + normalise a checklist payload. Returns [] for invalid input. */
export function sanitiseChecklist(input: unknown): ChecklistItem[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: ChecklistItem[] = [];

  for (const raw of input) {
    if (out.length >= MAX_CHECKLIST) break;
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;
    const text = typeof obj.text === "string"
      ? obj.text.replace(CONTROL_CHARS, " ").trim().slice(0, MAX_CHECKLIST_TEXT)
      : "";
    if (!text) continue;

    // Re-use the supplied id only if it's a UUID; otherwise mint a new one
    // so a client cannot point at an external resource via the field.
    const id = typeof obj.id === "string" && isValidUUID(obj.id)
      ? obj.id
      : crypto.randomUUID();
    if (seen.has(id)) continue;
    seen.add(id);

    out.push({ id, text, done: obj.done === true });
  }
  return out;
}

/** Validate + normalise a links payload. Returns [] for invalid input. */
export function sanitiseLinks(input: unknown): LinkItem[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: LinkItem[] = [];

  for (const raw of input) {
    if (out.length >= MAX_LINKS) break;
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;
    const url = typeof obj.url === "string"
      ? obj.url.replace(CONTROL_CHARS, "").trim().slice(0, MAX_LINK_URL)
      : "";
    if (!HTTP_URL_RE.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    const label = typeof obj.label === "string"
      ? obj.label.replace(CONTROL_CHARS, " ").trim().slice(0, MAX_LINK_LABEL)
      : "";

    out.push({ url, label });
  }
  return out;
}

/** Validate assigned place ids: UUID shape + dedupe + size cap. */
export function sanitiseAssignedPlaceIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const v of input) {
    if (typeof v !== "string" || !isValidUUID(v)) continue;
    seen.add(v);
    if (seen.size >= MAX_PLACES) break;
  }
  return Array.from(seen);
}

/**
 * Filter the supplied place ids down to those actually owned by the
 * contributor. Returns the intersection. Pass an empty array to skip
 * the DB round-trip.
 */
export async function filterContributorPlaceIds(
  supabase: SupabaseClient,
  contributorId: string,
  placeIds: string[]
): Promise<string[]> {
  if (placeIds.length === 0) return [];
  const { data } = await supabase
    .from("places")
    .select("id")
    .eq("created_by", contributorId)
    .in("id", placeIds);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}
