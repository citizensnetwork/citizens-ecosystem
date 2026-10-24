/**
 * "The area in view" and the globe's list (`src/frontend/app/serving-areas-lib.jsx`, issue #259, PR C).
 *
 * The map's centre and zoom are matched ON THE DEVICE to the smallest area whose rectangle contains them (ties go to the nearest
 * centre), at the level the zoom allows: nothing zoomed right out, then the province, then a city or town, then a suburb. The
 * rectangles are approximate by design, so these tests use the seed's own numbers and pin the rules, not any border. The list's
 * read keeps only allow-listed fields and degrades to "not ok" instead of throwing.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadFrontend } from "./support/loadFrontend";

type Index = { byId: Record<string, { id: string; level: string; bbox: unknown; lat: number | null; raw: unknown }>; kids: Record<string, string[]> };
type Api = {
  AREA_ZOOM: { province: number; place: number; suburb: number };
  buildIndex: (a: unknown) => Index;
  mergeAreas: (i: Index, a: unknown) => Index;
  resolveLevel: (i: Index, level: string, lat: number, lng: number) => string | null;
  areaInView: (i: Index, lat: number, lng: number, zoom: number) => string | null;
  fetchServing: (id: string, f?: unknown) => Promise<{ ok: boolean; area?: { id: string; name: string; level: string }; main?: Record<string, unknown>[]; also?: Record<string, unknown>[] }>;
};

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const GP = U(1), KZN = U(2), PTA = U(3), CEN = U(4), MID = U(5), ELD = U(6), HAT = U(7);
type Row = ReturnType<typeof row>;
function row(id: string, name: string, level: string, parent: string | null, c: [number, number], b: [number, number, number, number]) {
  return { id, name, level, parent_id: parent, slug: name.toLowerCase(), sort: 0, centroid_lat: c[0], centroid_lng: c[1], bbox_south: b[0], bbox_west: b[1], bbox_north: b[2], bbox_east: b[3] };
}
// the seed's own numbers (supabase/migrations/195_service_areas.sql)
const GAUTENG = row(GP, "Gauteng", "province", null, [-26.2, 28.1], [-26.9, 27.2, -25.1, 29.0]);
const NATAL = row(KZN, "KwaZulu-Natal", "province", null, [-29.0, 30.9], [-31.1, 28.8, -26.8, 32.9]);
const PRETORIA = row(PTA, "Pretoria", "place", GP, [-25.7479, 28.2293], [-25.9, 28.05, -25.62, 28.4]);
const CENTURION = row(CEN, "Centurion", "place", GP, [-25.8603, 28.1894], [-25.93, 28.08, -25.8, 28.26]);
const MIDRAND = row(MID, "Midrand", "place", GP, [-25.9992, 28.1263], [-26.06, 28.05, -25.93, 28.22]);
const ELDORAIGNE = row(ELD, "Eldoraigne", "suburb", CEN, [-25.8312, 28.1593], [-25.8432, 28.1473, -25.8192, 28.1713]);
const HATFIELD = row(HAT, "Hatfield", "suburb", PTA, [-25.7487, 28.2389], [-25.7607, 28.2269, -25.7367, 28.2509]);
const ALL: Row[] = [GAUTENG, NATAL, PRETORIA, CENTURION, MIDRAND, ELDORAIGNE, HATFIELD];

let C: Api;
let idx: Index;
beforeAll(() => {
  const win = loadFrontend("serving-areas-lib.jsx");
  C = win.CCServing as Api;
  idx = C.buildIndex(ALL);
});

describe("the index keeps each area's geometry", () => {
  it("holds the rectangle and the centre, and merging later arrivals keeps them", () => {
    expect(idx.byId[PTA]!.bbox).toEqual({ s: -25.9, w: 28.05, n: -25.62, e: 28.4 });
    expect(idx.byId[PTA]!.lat).toBe(-25.7479);
    const small = C.buildIndex([GAUTENG, PRETORIA]);
    const merged = C.mergeAreas(small, [HATFIELD]);
    expect(merged.byId[HAT]!.bbox).not.toBeNull();
    expect(merged.byId[PTA]!.bbox).toEqual(idx.byId[PTA]!.bbox);
  });
  it("an area with no rectangle can never be resolved, and the rest still can", () => {
    const i = C.buildIndex([GAUTENG, { ...PRETORIA, bbox_south: null }]);
    expect(i.byId[PTA]!.bbox).toBeNull();
    expect(C.resolveLevel(i, "place", -25.7479, 28.2293)).toBeNull();
    expect(C.resolveLevel(i, "province", -25.7479, 28.2293)).toBe(GP);
  });
});

describe("resolving one level", () => {
  it("picks the area whose rectangle contains the point", () => {
    expect(C.resolveLevel(idx, "province", -25.7479, 28.2293)).toBe(GP);
    expect(C.resolveLevel(idx, "place", -25.7479, 28.2293)).toBe(PTA);
    expect(C.resolveLevel(idx, "suburb", -25.7487, 28.2389)).toBe(HAT);
  });
  it("when two rectangles contain it, the SMALLEST wins (Centurion sits inside Pretoria's rectangle)", () => {
    expect(C.resolveLevel(idx, "place", -25.8603, 28.1894)).toBe(CEN);
  });
  it("on a tie of size, the nearest centre wins, and the answer is the same every time", () => {
    const twin = row(U(50), "Twin", "place", GP, [-25.7, 28.3], [-25.9, 28.05, -25.62, 28.4]); // same rectangle as Pretoria
    const i = C.buildIndex([GAUTENG, PRETORIA, twin]);
    expect(C.resolveLevel(i, "place", -25.7479, 28.2293)).toBe(PTA); // nearer Pretoria's centre
    expect(C.resolveLevel(i, "place", -25.69, 28.31)).toBe(U(50)); // nearer Twin's centre
    expect(C.resolveLevel(i, "place", -25.7479, 28.2293)).toBe(C.resolveLevel(i, "place", -25.7479, 28.2293));
  });
  it("answers null for a point outside every rectangle of that level", () => {
    expect(C.resolveLevel(idx, "place", -33.9, 18.4)).toBeNull();
    expect(C.resolveLevel(idx, "suburb", -25.70, 28.20)).toBeNull();
  });
  it("a rectangle's edge counts as inside", () => {
    expect(C.resolveLevel(idx, "place", -25.9, 28.05)).not.toBeNull();
  });
});

describe("the area in view follows the zoom", () => {
  const view = (lat: number, lng: number, zoom: number) => C.areaInView(idx, lat, lng, zoom);
  it("uses the same gate style as the pins: nothing below the province gate", () => {
    expect(C.AREA_ZOOM).toEqual({ province: 6, place: 9.5, suburb: 12.5 });
    expect(view(-25.7479, 28.2293, 5.9)).toBeNull();
    expect(view(-25.7479, 28.2293, 0)).toBeNull();
  });
  it("is the province zoomed out, a city or town closer in, a suburb closest", () => {
    expect(view(-25.7487, 28.2389, 7)).toBe(GP);
    expect(view(-25.7487, 28.2389, 9.4)).toBe(GP);
    expect(view(-25.7487, 28.2389, 9.5)).toBe(PTA);
    expect(view(-25.7487, 28.2389, 12.4)).toBe(PTA);
    expect(view(-25.7487, 28.2389, 12.5)).toBe(HAT);
    expect(view(-25.7487, 28.2389, 18)).toBe(HAT);
  });
  it("falls back to the next level up when the closer level has no answer (no suburb loaded here)", () => {
    expect(view(-25.70, 28.20, 14)).toBe(PTA); // no suburb rectangle holds this point
    expect(view(-26.7, 27.5, 11)).toBe(GP);        // a place of nowhere in particular: the province
  });
  it("answers null outside every province, and for anything that is not a usable number", () => {
    expect(view(-33.9, 18.4, 11)).toBeNull();
    expect(view(NaN, 28, 11)).toBeNull();
    expect(view(-25.7, Infinity, 11)).toBeNull();
    expect(view(-25.7, 28.2, NaN)).toBeNull();
    expect(C.areaInView(null as never, -25.7, 28.2, 11)).toBeNull();
    expect(C.areaInView(C.buildIndex([]), -25.7, 28.2, 11)).toBeNull();
  });
  it("never produces an area it does not have", () => {
    for (const [lat, lng, z] of [[-25.86, 28.19, 11], [-26.0, 28.1, 12], [-25.83, 28.159, 13], [-29, 30.9, 8]] as const) {
      const id = view(lat, lng, z);
      expect(id === null || !!idx.byId[id]).toBe(true);
    }
  });
});

function served(extra: Record<string, unknown> = {}) {
  return {
    id: U(100), name: "Daily Word Online", slug: "daily-word", kind: "ministry", category: "worship", avatar_url: null, logo_url: null, presence: "online",
    served: { id: PTA, name: "Pretoria", level: "place" }, ...extra,
  };
}
const also = (extra: Record<string, unknown> = {}) => ({ id: U(200), name: "Midrand Care Vans", slug: null, kind: null, category: null, avatar_url: null, logo_url: null, presence: "no_fixed_place", centre_name: "Midrand", radius_km: 50, distance_km: 22.4, ...extra });
function fakeFetch(status: number, body: unknown) {
  const calls: string[] = [];
  const f = (path: string) => {
    calls.push(path);
    if (status === 0) return Promise.reject(new Error("offline"));
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  };
  return { f, calls };
}
const AREA = { id: PTA, name: "Pretoria", slug: "pretoria", level: "place" };

describe("the globe's list read", () => {
  it("asks for ONE area by id and never sends a coordinate", async () => {
    const { f, calls } = fakeFetch(200, { data: { area: AREA, main: [], also_served_by: [] } });
    await C.fetchServing(PTA, f);
    expect(calls).toEqual(["/api/v1/serving?area=" + PTA]);
    expect(calls[0]).not.toMatch(/lat|lng|coord/i);
  });
  it("shapes both lists and keeps only the allow-listed fields", async () => {
    const leaky = { ...served(), contact_email: "private@example.invalid", physical_latitude: -25.7, whatsapp_number: "27000000000" };
    const { f } = fakeFetch(200, { data: { area: AREA, main: [leaky], also_served_by: [also()] } });
    const r = await C.fetchServing(PTA, f);
    expect(r.ok).toBe(true);
    expect(r.area).toEqual({ id: PTA, name: "Pretoria", level: "place" });
    expect(Object.keys(r.main![0]!).sort()).toEqual(["avatarUrl", "category", "id", "kind", "logoUrl", "name", "presence", "served", "slug"]);
    expect(JSON.stringify(r)).not.toMatch(/private@|physical|whatsapp|27000000000/);
    expect(r.also![0]).toMatchObject({ name: "Midrand Care Vans", centreName: "Midrand", radiusKm: 50, distanceKm: 22.4, presence: "no_fixed_place" });
  });
  it("drops rows that are not well formed instead of failing the list", async () => {
    const { f } = fakeFetch(200, { data: { area: AREA, main: [served(), { ...served(), id: "bad" }, { ...served({ id: U(101) }), name: "  " }, { ...served({ id: U(102) }), served: { id: "x", name: "?", level: "place" } }, null], also_served_by: [also({ radius_km: "50" }), also({ id: U(201), distance_km: "far" }), also({ id: U(202) })] } });
    const r = await C.fetchServing(PTA, f);
    expect(r.main!.map((m) => m.id)).toEqual([U(100)]);
    expect(r.also!.map((m) => m.id)).toEqual([U(202)]);
  });
  it("a tag it does not know is simply no tag (never a raw value on screen)", async () => {
    const { f } = fakeFetch(200, { data: { area: AREA, main: [served({ presence: "galaxy" }), served({ id: U(103), presence: null })], also_served_by: [] } });
    const r = await C.fetchServing(PTA, f);
    expect(r.main!.map((m) => m.presence)).toEqual([null, null]);
  });
  it("answers not-ok (never throws) for a bad id, a failed request, an error status or a body without an area", async () => {
    expect((await C.fetchServing("gauteng", fakeFetch(200, {}).f)).ok).toBe(false);
    expect((await C.fetchServing(PTA, fakeFetch(0, {}).f)).ok).toBe(false);
    expect((await C.fetchServing(PTA, fakeFetch(500, {}).f)).ok).toBe(false);
    expect((await C.fetchServing(PTA, fakeFetch(200, { data: { main: [] } }).f)).ok).toBe(false);
    expect((await C.fetchServing(PTA, fakeFetch(200, null).f)).ok).toBe(false);
    expect((await C.fetchServing(PTA, undefined as never)).ok).toBe(false);
  });
});
