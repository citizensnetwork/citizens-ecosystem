/**
 * Co-hosted events on the public read surface (tracker P2-09, migration 184).
 *
 * public.event_cohosts holds who is invited to, accepted on or declined an event. The table is read-only; row-level security
 * lets ANYONE read the ACCEPTED rows of an event they can see, so these helpers run with the caller's own client (the
 * public key included) and never need the service role. A pending or declined invitation is never visible to the public, and
 * nothing here asks for one.
 *
 * Two things the public routes need:
 *   - `acceptedCohostEventIds`   the events a Contributor co-hosts, so their page lists them next to the ones they created
 *   - `attachCoHostIds`          for a page of events, who the accepted co-hosts are (`co_host_ids`, additive: the existing
 *                                fields and `created_by` are unchanged, so an older consumer keeps working)
 */
import { isValidUUID } from "@/lib/validation";

/** The two calls we make, typed narrowly so a test can stand in for the client. */
type Chain = {
  select: (cols: string) => Chain;
  eq: (col: string, val: string) => Chain;
  in: (col: string, vals: string[]) => PromiseLike<{ data: unknown; error: unknown }> & Chain;
  limit: (n: number) => PromiseLike<{ data: unknown; error: unknown }>;
};
export type CohostClient = { from: (table: string) => unknown };
const table = (c: CohostClient) => c.from("event_cohosts") as Chain;

/** A Contributor can co-host at most this many events we will fold into one page (a ceiling, not a feature). */
export const COHOST_EVENTS_CAP = 200;

/** Event ids the Contributor has ACCEPTED a co-host invitation for. A failed read gives [] (the page then lists only their own). */
export async function acceptedCohostEventIds(client: CohostClient, contributorId: string): Promise<string[]> {
  if (!isValidUUID(contributorId)) return [];
  const res = (await table(client)
    .select("event_id")
    .eq("contributor_id", contributorId)
    .eq("status", "accepted")
    .limit(COHOST_EVENTS_CAP)) as { data: unknown; error: unknown };
  if (res.error || !Array.isArray(res.data)) return [];
  return (res.data as { event_id?: unknown }[])
    .map((r) => r.event_id)
    .filter((id): id is string => isValidUUID(id));
}

/**
 * The PostgREST `or` filter for "created by this Contributor, or one of these events". Every id is re-checked as a UUID
 * before it is put into the filter text, so nothing but a UUID can ever reach it.
 */
export function createdByOrIn(contributorId: string, eventIds: string[]): string {
  if (!isValidUUID(contributorId)) throw new Error("createdByOrIn: contributorId must be a UUID");
  const ids = eventIds.filter((id) => isValidUUID(id));
  return ids.length ? `created_by.eq.${contributorId},id.in.(${ids.join(",")})` : `created_by.eq.${contributorId}`;
}

/** Adds `co_host_ids` (the accepted co-hosts, in a stable order) to each event row. A failed read adds empty lists. */
export async function attachCoHostIds<T extends object>(client: CohostClient, rows: T[]): Promise<(T & { co_host_ids: string[] })[]> {
  // `id` is read through a cast: a row type with an index signature and no `id` of its own (the events feed's) would
  // otherwise fail TypeScript's weak-type check against `{ id?: unknown }`.
  const idOf = (r: T) => (r as { id?: unknown }).id;
  const ids = rows.map(idOf).filter((id): id is string => isValidUUID(id));
  const by = new Map<string, string[]>();
  if (ids.length) {
    const res = (await table(client).select("event_id,contributor_id").eq("status", "accepted").in("event_id", ids)) as {
      data: unknown;
      error: unknown;
    };
    if (!res.error && Array.isArray(res.data)) {
      for (const r of res.data as { event_id?: unknown; contributor_id?: unknown }[]) {
        if (!isValidUUID(r.event_id) || !isValidUUID(r.contributor_id)) continue;
        const list = by.get(r.event_id) ?? [];
        list.push(r.contributor_id);
        by.set(r.event_id, list);
      }
    }
  }
  return rows.map((r) => {
    const id = idOf(r);
    return { ...r, co_host_ids: (typeof id === "string" ? by.get(id) : undefined)?.slice().sort() ?? [] };
  });
}
