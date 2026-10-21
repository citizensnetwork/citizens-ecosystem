import { describe, it, expect } from "vitest";
import {
  ALSO_SERVED_LIMIT,
  MAX_RADIUS_KM,
  MAX_SERVICE_AREAS,
  haversineKm,
  parseSelectionPayload,
  shapeServing,
  type ListingRow,
} from "@/lib/serviceAreas";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const AREA = { id: U(1), name: "Pretoria", slug: "pretoria", level: "place" as const };

describe("parseSelectionPayload", () => {
  const ok = { area_ids: [U(2)] };

  it("accepts a minimal selection for the caller's own listing", () => {
    expect(parseSelectionPayload(ok)).toEqual({
      ok: true,
      contributorId: null,
      selection: { areaIds: [U(2)], radiusKm: null, radiusCentreAreaId: null },
    });
  });

  it("accepts an empty selection (clearing every area)", () => {
    expect(parseSelectionPayload({ area_ids: [] })).toMatchObject({ ok: true, selection: { areaIds: [] } });
  });

  it("folds duplicates, ignoring case, and lower-cases ids", () => {
    const upper = U(2).toUpperCase();
    const r = parseSelectionPayload({ area_ids: [U(2), upper, U(3)], contributor_id: U(9).toUpperCase() });
    expect(r).toMatchObject({ ok: true, contributorId: U(9), selection: { areaIds: [U(2), U(3)] } });
  });

  it.each([null, undefined, 5, "x", [], [U(2)]])("rejects a body that is not an object (%j)", (b) => {
    expect(parseSelectionPayload(b)).toEqual({ ok: false, error: "bad_request" });
  });

  it("rejects area_ids that are missing, not an array, or not uuids", () => {
    expect(parseSelectionPayload({})).toEqual({ ok: false, error: "invalid_area_ids" });
    expect(parseSelectionPayload({ area_ids: U(2) })).toEqual({ ok: false, error: "invalid_area_ids" });
    expect(parseSelectionPayload({ area_ids: ["gauteng"] })).toEqual({ ok: false, error: "invalid_area_ids" });
    expect(parseSelectionPayload({ area_ids: [1] })).toEqual({ ok: false, error: "invalid_area_ids" });
    expect(parseSelectionPayload({ area_ids: [{ id: U(2) }] })).toEqual({ ok: false, error: "invalid_area_ids" });
  });

  it(`caps the list at ${MAX_SERVICE_AREAS} before reading any element`, () => {
    const many = Array.from({ length: MAX_SERVICE_AREAS + 1 }, (_, i) => U(i + 1));
    expect(parseSelectionPayload({ area_ids: many })).toEqual({ ok: false, error: "too_many_areas" });
    const exact = many.slice(0, MAX_SERVICE_AREAS);
    expect(parseSelectionPayload({ area_ids: exact })).toMatchObject({ ok: true });
    // the cap is on what was sent, not on what is left after folding duplicates
    const dupes = Array.from({ length: MAX_SERVICE_AREAS + 1 }, () => U(2));
    expect(parseSelectionPayload({ area_ids: dupes })).toEqual({ ok: false, error: "too_many_areas" });
  });

  it("validates the contributor id when present", () => {
    expect(parseSelectionPayload({ ...ok, contributor_id: "me" })).toEqual({ ok: false, error: "invalid_contributor_id" });
    expect(parseSelectionPayload({ ...ok, contributor_id: 7 })).toEqual({ ok: false, error: "invalid_contributor_id" });
    expect(parseSelectionPayload({ ...ok, contributor_id: null })).toMatchObject({ ok: true, contributorId: null });
  });

  it(`takes a whole-number radius from 1 to ${MAX_RADIUS_KM} and nothing else`, () => {
    for (const km of [1, 10, 25, 50, 100]) {
      expect(parseSelectionPayload({ ...ok, radius_km: km })).toMatchObject({ ok: true, selection: { radiusKm: km } });
    }
    for (const km of [0, -5, 101, 1000, 12.5, NaN, Infinity, "50", true]) {
      expect(parseSelectionPayload({ ...ok, radius_km: km })).toEqual({ ok: false, error: "radius_out_of_range" });
    }
    expect(parseSelectionPayload({ ...ok, radius_km: null })).toMatchObject({ ok: true, selection: { radiusKm: null } });
  });

  it("validates the radius centre and refuses a centre with no radius", () => {
    expect(parseSelectionPayload({ ...ok, radius_km: 25, radius_centre_area_id: U(2) })).toMatchObject({
      ok: true,
      selection: { radiusKm: 25, radiusCentreAreaId: U(2) },
    });
    expect(parseSelectionPayload({ ...ok, radius_km: 25, radius_centre_area_id: "x" })).toEqual({ ok: false, error: "invalid_radius_centre" });
    expect(parseSelectionPayload({ ...ok, radius_centre_area_id: U(2) })).toEqual({ ok: false, error: "radius_centre_without_radius" });
  });
});

const row = (over: Partial<ListingRow>): ListingRow => ({
  section: "main",
  contributor_id: U(10),
  full_name: "Daily Word Online",
  contributor_slug: "daily-word",
  contributor_kind: "ministry",
  contributor_category: "worship",
  avatar_url: null,
  logo_url: null,
  matched_area_id: U(1),
  matched_area_name: "Pretoria",
  matched_level: "place",
  centre_area_name: null,
  radius_km: null,
  distance_km: null,
  ...over,
});

describe("shapeServing", () => {
  it("groups the main list suburb, then city or town, then province, then A to Z", () => {
    const rows = [
      row({ contributor_id: U(11), full_name: "Zed Province", matched_level: "province", matched_area_name: "Gauteng", matched_area_id: U(5) }),
      row({ contributor_id: U(12), full_name: "beta Town" }),
      row({ contributor_id: U(13), full_name: "Alpha Town" }),
      row({ contributor_id: U(14), full_name: "Mid Suburb", matched_level: "suburb", matched_area_name: "Hatfield", matched_area_id: U(6) }),
      row({ contributor_id: U(15), full_name: "Aaa Province", matched_level: "province", matched_area_name: "Gauteng", matched_area_id: U(5) }),
    ];
    const names = shapeServing(AREA, rows).main.map((m) => m.name);
    expect(names).toEqual(["Mid Suburb", "Alpha Town", "beta Town", "Aaa Province", "Zed Province"]);
  });

  it("keeps 'also served by' nearest first, then A to Z, and caps it", () => {
    const also = (n: number, name: string, d: number | string) =>
      row({ section: "also", contributor_id: U(n), full_name: name, radius_km: 50, distance_km: d, centre_area_name: "Midrand", matched_area_id: null, matched_area_name: null, matched_level: null });
    const rows = [also(21, "Zulu", 30), also(22, "Alpha", 30), also(23, "Near", "4.5"), also(24, "d", 31), also(25, "e", 32), also(26, "f", 33), also(27, "g", 34)];
    const r = shapeServing(AREA, rows).also_served_by;
    expect(r.map((x) => x.name)).toEqual(["Near", "Alpha", "Zulu", "d", "e"]);
    expect(r).toHaveLength(ALSO_SERVED_LIMIT);
    expect(r[0]?.distance_km).toBe(4.5); // a numeric string from the database becomes a number
  });

  it("never lets a popularity-like field reorder anything", () => {
    const a = row({ contributor_id: U(31), full_name: "Bbb" });
    const b = row({ contributor_id: U(32), full_name: "Aaa" });
    (a as unknown as Record<string, unknown>).follower_count = 99999;
    (b as unknown as Record<string, unknown>).follower_count = 0;
    expect(shapeServing(AREA, [a, b]).main.map((m) => m.name)).toEqual(["Aaa", "Bbb"]);
  });

  it("returns only the allow-listed fields: no contact details can leak through", () => {
    const leaky = row({}) as unknown as Record<string, unknown>;
    leaky.contact_email = "private@example.invalid";
    leaky.physical_latitude = -25.7;
    leaky.whatsapp_number = "27000000000";
    const out = shapeServing(AREA, [leaky as unknown as ListingRow]);
    expect(Object.keys(out.main[0]!).sort()).toEqual(["avatar_url", "category", "id", "kind", "logo_url", "name", "served", "slug"]);
    expect(JSON.stringify(out)).not.toMatch(/private@|physical|whatsapp|27000000000/);
  });

  it("skips malformed rows instead of failing the list", () => {
    const rows = [
      row({ contributor_id: "not-a-uuid" }),
      row({ contributor_id: U(41), full_name: "   " }),
      row({ contributor_id: U(42), full_name: null }),
      row({ contributor_id: U(43), matched_level: "galaxy" }),
      row({ contributor_id: U(44), matched_area_id: null }),
      row({ section: "also", contributor_id: U(45), radius_km: null, distance_km: 3 }),
      row({ section: "also", contributor_id: U(46), radius_km: 50, distance_km: "far" }),
      row({ section: "sideways", contributor_id: U(47) }),
      row({ contributor_id: U(48), full_name: "Good One" }),
    ];
    const out = shapeServing(AREA, rows);
    expect(out.main.map((m) => m.name)).toEqual(["Good One"]);
    expect(out.also_served_by).toEqual([]);
  });

  it("lists a Contributor once even if the database returned two rows", () => {
    const out = shapeServing(AREA, [row({ contributor_id: U(51) }), row({ contributor_id: U(51), matched_level: "province" })]);
    expect(out.main).toHaveLength(1);
  });

  it("echoes the area and tolerates no rows", () => {
    expect(shapeServing(AREA, [])).toEqual({ area: AREA, main: [], also_served_by: [] });
  });
});

describe("haversineKm", () => {
  it("is zero for the same point and symmetric", () => {
    expect(haversineKm(-25.7, 28.2, -25.7, 28.2)).toBe(0);
    expect(haversineKm(-25.7, 28.2, -26.2, 28.0)).toBeCloseTo(haversineKm(-26.2, 28.0, -25.7, 28.2), 9);
  });
  it("puts Pretoria and Johannesburg about 55 km apart and Midrand within 50 km of Pretoria", () => {
    const pta = haversineKm(-25.7479, 28.2293, -26.2041, 28.0473);
    expect(pta).toBeGreaterThan(50);
    expect(pta).toBeLessThan(60);
    expect(haversineKm(-25.7479, 28.2293, -25.9992, 28.1263)).toBeLessThan(50);
  });
});
