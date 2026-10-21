/**
 * Serving areas (issue #259, migration 195): the rules that are not SQL.
 *
 * Selection rule (founder, 2026-10-21): a tick means that area and everything inside it and NEVER propagates upward;
 * matching goes downward only (a viewer in Eldoraigne matches anyone who ticked Eldoraigne or an area containing it).
 * The database owns that rule (`serving_area_listings` walks UP from the viewed area). This module owns the request
 * validation for the one write route, the shape of the public read, and the constants both sides share.
 */

import { isValidUUID } from "@/lib/validation";

export type ServiceAreaLevel = "province" | "place" | "suburb";

/** Presets offered in the picker. The server accepts any whole number from 1 to MAX_RADIUS_KM. */
export const RADIUS_PRESETS_KM = [10, 25, 50, 100] as const;
export const MAX_RADIUS_KM = 100;
/** Most areas one Contributor can serve (also checked in set_service_areas). */
export const MAX_SERVICE_AREAS = 20;
/** "Also served by" is a quiet few, never a second directory. */
export const ALSO_SERVED_LIMIT = 5;

/** Specificity, most specific first. Used to group the globe's main list. */
const LEVEL_RANK: Record<ServiceAreaLevel, number> = { suburb: 0, place: 1, province: 2 };

export function isServiceAreaLevel(v: unknown): v is ServiceAreaLevel {
  return v === "province" || v === "place" || v === "suburb";
}

/**
 * The plain tag the owner chooses (founder naming rule, 2026-10-21): "online" for online-only Contributors (the default)
 * or "no_fixed_place" for a travelling or mobile ministry that serves people in person and is NOT online. Public rows
 * carry it so nobody is labelled "Online" who is not.
 */
export type ServingPresence = "online" | "no_fixed_place";
export const DEFAULT_PRESENCE: ServingPresence = "online";

export function isServingPresence(v: unknown): v is ServingPresence {
  return v === "online" || v === "no_fixed_place";
}

export type ServiceAreaSelection = {
  areaIds: string[];
  radiusKm: number | null;
  radiusCentreAreaId: string | null;
  presence: ServingPresence;
};

export type ParsedSelection =
  | { ok: true; contributorId: string | null; selection: ServiceAreaSelection }
  | { ok: false; error: string };

/**
 * Validate the body of PUT /api/contributor/service-areas. The database re-checks everything that matters (who may
 * write, which areas exist, the centre rule); this keeps junk out of the RPC and gives a precise 400.
 * `contributor_id` is optional: absent means the caller's own listing.
 */
export function parseSelectionPayload(body: unknown): ParsedSelection {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "bad_request" };
  const b = body as Record<string, unknown>;

  let contributorId: string | null = null;
  if (b.contributor_id !== undefined && b.contributor_id !== null) {
    if (typeof b.contributor_id !== "string" || !isValidUUID(b.contributor_id)) return { ok: false, error: "invalid_contributor_id" };
    contributorId = b.contributor_id.toLowerCase();
  }

  if (!Array.isArray(b.area_ids)) return { ok: false, error: "invalid_area_ids" };
  // bound the work before looking at any element
  if (b.area_ids.length > MAX_SERVICE_AREAS) return { ok: false, error: "too_many_areas" };
  const seen = new Set<string>();
  for (const id of b.area_ids) {
    if (typeof id !== "string" || !isValidUUID(id)) return { ok: false, error: "invalid_area_ids" };
    seen.add(id.toLowerCase());
  }

  let radiusKm: number | null = null;
  if (b.radius_km !== undefined && b.radius_km !== null) {
    if (typeof b.radius_km !== "number" || !Number.isInteger(b.radius_km) || b.radius_km < 1 || b.radius_km > MAX_RADIUS_KM) {
      return { ok: false, error: "radius_out_of_range" };
    }
    radiusKm = b.radius_km;
  }

  let radiusCentreAreaId: string | null = null;
  if (b.radius_centre_area_id !== undefined && b.radius_centre_area_id !== null) {
    if (typeof b.radius_centre_area_id !== "string" || !isValidUUID(b.radius_centre_area_id)) return { ok: false, error: "invalid_radius_centre" };
    radiusCentreAreaId = b.radius_centre_area_id.toLowerCase();
  }
  // a centre without a radius means nothing; refuse rather than silently drop it
  if (radiusKm === null && radiusCentreAreaId !== null) return { ok: false, error: "radius_centre_without_radius" };

  // absent means the default; anything else must be one of the two tags
  let presence: ServingPresence = DEFAULT_PRESENCE;
  if (b.presence !== undefined && b.presence !== null) {
    if (!isServingPresence(b.presence)) return { ok: false, error: "invalid_presence" };
    presence = b.presence;
  }

  return { ok: true, contributorId, selection: { areaIds: [...seen], radiusKm, radiusCentreAreaId, presence } };
}

/** What set_service_areas answers when it refuses, and the HTTP status each one gets. */
export const SET_REFUSALS: Record<string, { status: number; error: string }> = {
  not_authenticated: { status: 401, error: "Unauthorized" },
  not_allowed: { status: 403, error: "Forbidden" },
  not_found: { status: 404, error: "not_found" },
  not_a_contributor: { status: 403, error: "not_a_contributor" },
  too_many_areas: { status: 400, error: "too_many_areas" },
  unknown_area: { status: 400, error: "unknown_area" },
  radius_out_of_range: { status: 400, error: "radius_out_of_range" },
  centre_not_ticked: { status: 400, error: "centre_not_ticked" },
  radius_needs_centre: { status: 400, error: "radius_needs_centre" },
  invalid_presence: { status: 400, error: "invalid_presence" },
};

/** A row of `serving_area_listings`, exactly as the database returns it. */
export type ListingRow = {
  section: string;
  contributor_id: string;
  full_name: string | null;
  contributor_slug: string | null;
  contributor_kind: string | null;
  contributor_category: string | null;
  avatar_url: string | null;
  logo_url: string | null;
  matched_area_id: string | null;
  matched_area_name: string | null;
  matched_level: string | null;
  centre_area_name: string | null;
  radius_km: number | null;
  distance_km: number | string | null;
  presence?: string | null;
};

export type ServingContributor = {
  id: string;
  name: string;
  slug: string | null;
  kind: string | null;
  category: string | null;
  avatar_url: string | null;
  logo_url: string | null;
  /** "online" or "no_fixed_place"; null for a Contributor who has a map pin (the tag does not describe them). */
  presence: ServingPresence | null;
};

export type ServingMainItem = ServingContributor & {
  /** The area the Contributor ticked that put them in this list (the viewed area, or one containing it). */
  served: { id: string; name: string; level: ServiceAreaLevel };
};

export type ServingAlsoItem = ServingContributor & {
  /** The ticked area the radius is measured from; null when it is measured from their own pin. */
  centre_name: string | null;
  radius_km: number;
  distance_km: number;
};

export type ServingResponse = {
  area: { id: string; name: string; slug: string; level: ServiceAreaLevel };
  main: ServingMainItem[];
  also_served_by: ServingAlsoItem[];
};

const nameOf = (c: { name: string }) => c.name.toLocaleLowerCase("en");
const byName = (a: { name: string; id: string }, b: { name: string; id: string }) =>
  nameOf(a) < nameOf(b) ? -1 : nameOf(a) > nameOf(b) ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * Turn the database rows into the public answer. Two jobs beyond renaming: (1) an allow-list, so a column added to the
 * function later can never leak through this route by accident; (2) the order the founder asked for: the main list
 * grouped by how specific the ticked area is (suburb, city or town, province) then A to Z; "Also served by" keeps the
 * database's order (nearest first, then A to Z) and is capped. Never popularity.
 */
export function shapeServing(
  area: { id: string; name: string; slug: string; level: ServiceAreaLevel },
  rows: ListingRow[],
): ServingResponse {
  const main: ServingMainItem[] = [];
  const also: ServingAlsoItem[] = [];
  const seenMain = new Set<string>();

  for (const r of rows) {
    if (!r || typeof r.contributor_id !== "string" || !isValidUUID(r.contributor_id)) continue;
    const base: ServingContributor = {
      id: r.contributor_id,
      name: typeof r.full_name === "string" ? r.full_name.trim() : "",
      slug: r.contributor_slug ?? null,
      kind: r.contributor_kind ?? null,
      category: r.contributor_category ?? null,
      avatar_url: r.avatar_url ?? null,
      logo_url: r.logo_url ?? null,
      // an unknown tag degrades to the default rather than showing a raw value
      presence: r.presence === null || r.presence === undefined ? null : isServingPresence(r.presence) ? r.presence : DEFAULT_PRESENCE,
    };
    if (!base.name) continue;
    if (r.section === "main" && isServiceAreaLevel(r.matched_level) && r.matched_area_id && r.matched_area_name) {
      if (seenMain.has(base.id)) continue;
      seenMain.add(base.id);
      main.push({ ...base, served: { id: r.matched_area_id, name: r.matched_area_name, level: r.matched_level } });
    } else if (r.section === "also") {
      const distance = typeof r.distance_km === "string" ? Number(r.distance_km) : r.distance_km;
      if (typeof r.radius_km !== "number" || typeof distance !== "number" || !Number.isFinite(distance)) continue;
      also.push({ ...base, centre_name: r.centre_area_name ?? null, radius_km: r.radius_km, distance_km: distance });
    }
  }

  main.sort((a, b) => LEVEL_RANK[a.served.level] - LEVEL_RANK[b.served.level] || byName(a, b));
  // the database already orders these; re-sorting here keeps the contract true even if a caller feeds unsorted rows
  also.sort((a, b) => a.distance_km - b.distance_km || byName(a, b));
  return { area, main, also_served_by: also.slice(0, ALSO_SERVED_LIMIT) };
}

/** Great-circle distance in kilometres (the same formula `serving_area_listings` uses). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
