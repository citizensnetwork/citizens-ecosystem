/**
 * Serving areas, the rules (`src/frontend/app/serving-areas-lib.jsx`, issue #259).
 *
 * The founder's selection rule is what this file pins: expanding is not ticking; a tick means that area and everything inside
 * it and NEVER propagates upward (choosing Eldoraigne does not choose Centurion or Gauteng); a distance is an add-on that
 * needs a centre, so it stays off until an area is chosen and is measured from the most specific chosen area; the owner's tag
 * is Online or No fixed place. The database enforces the same rules (probe 195); this is the screen's copy, which explains a
 * choice before it is saved and never shows the server's own words.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFrontend } from "./support/loadFrontend";

type Sel = { areaIds: string[]; radiusKm: number | null; radiusCentreAreaId: string | null; presence: string };
type Index = { byId: Record<string, { id: string; parentId: string | null; level: string; name: string }>; kids: Record<string, string[]> };
type Api = {
  PRESETS: number[];
  MAX_AREAS: number;
  emptySelection: () => Sel;
  buildIndex: (areas: unknown) => Index;
  mergeAreas: (i: Index, areas: unknown) => Index;
  childIds: (i: Index, id: string | null) => string[];
  rootIds: (i: Index) => string[];
  ancestorsOf: (i: Index, id: string) => string[];
  hasChosenInside: (i: Index, ids: string[], id: string) => boolean;
  toggleArea: (i: Index, s: Sel, id: string) => { selection: Sel; reason: string | null };
  normalise: (i: Index, s: unknown) => Sel;
  defaultCentre: (i: Index, ids: string[]) => string | null;
  setRadius: (i: Index, s: Sel, km: number | null) => Sel;
  setCentre: (i: Index, s: Sel, id: string) => Sel;
  setPresence: (s: Sel, p: string) => Sel;
  summaryParts: (i: Index, ids: string[]) => { id: string; name: string; level: string; all: boolean }[];
  summaryText: (i: Index, ids: string[], S: unknown) => string;
  search: (i: Index, q: string) => string[];
  payloadOf: (s: Sel) => Record<string, unknown>;
  selectionFromServer: (b: unknown) => Sel;
  offersPicker: (row: unknown) => boolean;
  isUuid: (v: unknown) => boolean;
  fetchAreas: (q: string, f?: unknown) => Promise<{ ok: boolean; areas: { id: string }[] }>;
  loadSelection: (f: unknown, id: string | null) => Promise<{ ok: boolean; selection?: Sel }>;
  saveSelection: (f: unknown, id: string | null, s: Sel) => Promise<{ ok: boolean; reason?: string; message?: string; selection?: Sel }>;
  messageFor: (status: number | string, error?: string) => string;
};

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const GP = U(1), PTA = U(2), CEN = U(3), ELD = U(4), HAT = U(5), KZN = U(6), JHB = U(7), BRK = U(8);
const row = (id: string, name: string, level: string, parent: string | null, sort = 0) => ({ id, name, level, parent_id: parent, slug: name.toLowerCase(), sort });
const AREAS = [
  row(GP, "Gauteng", "province", null),
  row(KZN, "KwaZulu-Natal", "province", null),
  row(PTA, "Pretoria", "place", GP),
  row(CEN, "Centurion", "place", GP),
  row(JHB, "Johannesburg", "place", GP),
  row(ELD, "Eldoraigne", "suburb", CEN),
  row(HAT, "Hatfield", "suburb", PTA),
  row(BRK, "Brooklyn", "suburb", PTA),
];

let C: Api;
let S: Record<string, unknown>;
let idx: Index;
beforeAll(() => {
  const win = loadFrontend("map-v2-strings.jsx");
  loadFrontend("serving-areas-lib.jsx", win);
  C = win.CCServing as Api;
  S = (win.MapV2Strings as { serving: Record<string, unknown> }).serving;
  idx = C.buildIndex(AREAS);
});

const sel = (...ids: string[]): Sel => ({ ...C.emptySelection(), areaIds: ids });

describe("the hierarchy", () => {
  it("builds the tree: provinces are the roots, each area's children are A to Z", () => {
    expect(C.rootIds(idx)).toEqual([GP, KZN]);
    expect(C.childIds(idx, GP).map((id) => idx.byId[id]!.name)).toEqual(["Centurion", "Johannesburg", "Pretoria"]);
    expect(C.childIds(idx, PTA).map((id) => idx.byId[id]!.name)).toEqual(["Brooklyn", "Hatfield"]);
    expect(C.childIds(idx, ELD)).toEqual([]);
  });
  it("lists an area's ancestors nearest first and never includes the area itself", () => {
    expect(C.ancestorsOf(idx, ELD)).toEqual([CEN, GP]);
    expect(C.ancestorsOf(idx, GP)).toEqual([]);
  });
  it("drops malformed rows instead of failing", () => {
    const i = C.buildIndex([...AREAS, { id: "nope", name: "X", level: "place" }, { id: U(99), name: "  ", level: "place" }, { id: U(98), name: "Y", level: "galaxy" }, null, { id: U(97), name: "Z", level: "place", parent_id: "bad" }]);
    expect(Object.keys(i.byId)).toHaveLength(AREAS.length);
    expect(C.buildIndex(null).byId).toEqual({});
  });
  it("merges later arrivals (suburbs) without losing what is there", () => {
    const small = C.buildIndex(AREAS.filter((a) => a.level !== "suburb"));
    const merged = C.mergeAreas(small, AREAS.filter((a) => a.level === "suburb"));
    expect(Object.keys(merged.byId)).toHaveLength(AREAS.length);
    expect(C.childIds(merged, CEN)).toEqual([ELD]);
    expect(C.mergeAreas(merged, AREAS)).toEqual(merged); // a duplicate changes nothing
  });
});

describe("a tick never propagates upward and never fans out", () => {
  it("choosing Eldoraigne chooses only Eldoraigne", () => {
    const r = C.toggleArea(idx, sel(), ELD);
    expect(r.selection.areaIds).toEqual([ELD]);
    expect(r.reason).toBeNull();
  });
  it("choosing Pretoria stores Pretoria only: its suburbs are covered by the tick, not added to the list", () => {
    expect(C.toggleArea(idx, sel(), PTA).selection.areaIds).toEqual([PTA]);
  });
  it("choosing a province stores only the province", () => {
    expect(C.toggleArea(idx, sel(), GP).selection.areaIds).toEqual([GP]);
  });
  it("a second tap unticks exactly that area", () => {
    expect(C.toggleArea(idx, sel(ELD, PTA), ELD).selection.areaIds).toEqual([PTA]);
  });
  it("ticking a parent leaves an already chosen suburb in place (nothing is removed behind the person's back)", () => {
    expect(C.toggleArea(idx, sel(HAT), PTA).selection.areaIds).toEqual([HAT, PTA]);
  });
  it("is capped at 20 and says so without changing anything", () => {
    const many = Array.from({ length: C.MAX_AREAS }, (_, i) => U(100 + i));
    const r = C.toggleArea(idx, sel(...many), ELD);
    expect(r.reason).toBe("too_many");
    expect(r.selection.areaIds).toEqual(many);
    // untick at the cap still works
    expect(C.toggleArea(idx, sel(...many), many[0]!).selection.areaIds).toHaveLength(C.MAX_AREAS - 1);
  });
});

describe("the neutral 'contains a chosen area' marker is display only", () => {
  it("is true for every parent of a chosen suburb, and not for the suburb, its siblings or other provinces", () => {
    const ids = [ELD];
    expect(C.hasChosenInside(idx, ids, CEN)).toBe(true);
    expect(C.hasChosenInside(idx, ids, GP)).toBe(true);
    expect(C.hasChosenInside(idx, ids, ELD)).toBe(false);
    expect(C.hasChosenInside(idx, ids, PTA)).toBe(false);
    expect(C.hasChosenInside(idx, ids, KZN)).toBe(false);
  });
  it("asking for it changes nothing in the selection", () => {
    const s = sel(ELD);
    C.hasChosenInside(idx, s.areaIds, GP);
    expect(s.areaIds).toEqual([ELD]);
  });
});

describe("the distance add-on", () => {
  it("does nothing until an area is chosen (a distance needs a centre)", () => {
    const s = C.setRadius(idx, sel(), 25);
    expect(s.radiusKm).toBeNull();
    expect(s.radiusCentreAreaId).toBeNull();
  });
  it("defaults its centre to the most specific chosen area: suburb, then city or town, then province", () => {
    expect(C.setRadius(idx, sel(GP, PTA, ELD), 50)).toMatchObject({ radiusKm: 50, radiusCentreAreaId: ELD });
    expect(C.setRadius(idx, sel(GP, PTA), 50).radiusCentreAreaId).toBe(PTA);
    expect(C.setRadius(idx, sel(GP), 50).radiusCentreAreaId).toBe(GP);
  });
  it("breaks a tie between equally specific areas A to Z", () => {
    expect(C.defaultCentre(idx, [PTA, CEN])).toBe(CEN); // Centurion before Pretoria
  });
  it("lets the owner pick another CHOSEN area as the centre, and ignores an area that is not chosen", () => {
    const s = C.setRadius(idx, sel(CEN, PTA), 25);
    expect(C.setCentre(idx, s, PTA).radiusCentreAreaId).toBe(PTA);
    expect(C.setCentre(idx, s, GP).radiusCentreAreaId).toBe(s.radiusCentreAreaId);
  });
  it("switches itself off when the last area is unticked, and re-centres when the centre is unticked", () => {
    const on = C.setRadius(idx, sel(PTA, ELD), 100);
    expect(on.radiusCentreAreaId).toBe(ELD);
    const moved = C.toggleArea(idx, on, ELD).selection;
    expect(moved).toMatchObject({ radiusKm: 100, radiusCentreAreaId: PTA });
    const off = C.toggleArea(idx, moved, PTA).selection;
    expect(off).toMatchObject({ areaIds: [], radiusKm: null, radiusCentreAreaId: null });
  });
  it("turns off with null, and refuses a value outside 1 to 100", () => {
    const on = C.setRadius(idx, sel(PTA), 50);
    expect(C.setRadius(idx, on, null).radiusKm).toBeNull();
    for (const bad of [0, -1, 101, 12.5, NaN]) expect(C.setRadius(idx, sel(PTA), bad as number).radiusKm).toBeNull();
  });
  it("offers 10, 25, 50 and 100 km", () => {
    expect(C.PRESETS).toEqual([10, 25, 50, 100]);
  });
});

describe("how people find the owner", () => {
  it("is online by default; the other choice is No fixed place; nothing else is accepted", () => {
    expect(C.emptySelection().presence).toBe("online");
    expect(C.setPresence(sel(PTA), "no_fixed_place").presence).toBe("no_fixed_place");
    expect(C.setPresence(sel(PTA), "travelling").presence).toBe("online");
    expect(C.normalise(idx, { areaIds: [PTA], presence: "weird" }).presence).toBe("online");
  });
});

describe("normalise", () => {
  it("folds duplicates, caps at 20, and drops a distance that has no centre or no area", () => {
    expect(C.normalise(idx, { areaIds: [PTA, PTA, CEN], radiusKm: 25 }).areaIds).toEqual([PTA, CEN]);
    expect(C.normalise(idx, { areaIds: [], radiusKm: 25 })).toMatchObject({ radiusKm: null, radiusCentreAreaId: null });
    expect(C.normalise(idx, { areaIds: Array.from({ length: 30 }, (_, i) => U(200 + i)) }).areaIds).toHaveLength(20);
    expect(C.normalise(idx, null)).toEqual(C.emptySelection());
    expect(C.normalise(idx, { areaIds: [PTA], radiusKm: 25, radiusCentreAreaId: GP }).radiusCentreAreaId).toBe(PTA); // GP is not chosen
  });
});

describe("the summary line says exactly what was chosen", () => {
  const text = (...ids: string[]) => C.summaryText(idx, ids, S);
  it("reads 'Serving: Eldoraigne' for a suburb and 'Serving: all of Pretoria' for a city or town", () => {
    expect(text(ELD)).toBe("Serving: Eldoraigne");
    expect(text(PTA)).toBe("Serving: all of Pretoria");
    expect(text(GP)).toBe("Serving: all of Gauteng");
  });
  it("hides a suburb that a chosen parent already covers (nothing is chosen twice on screen)", () => {
    expect(text(PTA, HAT)).toBe("Serving: all of Pretoria");
    expect(text(PTA, ELD)).toBe("Serving: Eldoraigne and all of Pretoria"); // A to Z; Eldoraigne is under Centurion, not Pretoria, so it stays
    expect(C.summaryParts(idx, [GP, PTA, ELD]).map((p) => p.name)).toEqual(["Gauteng"]);
  });
  it("lists two or three with 'and', and more as a count", () => {
    expect(text(PTA, CEN)).toBe("Serving: all of Centurion and all of Pretoria");
    expect(text(ELD, KZN, JHB)).toBe("Serving: Eldoraigne, all of Johannesburg and all of KwaZulu-Natal");
    expect(text(ELD, KZN, JHB, HAT, BRK)).toMatch(/and 2 more$/);
  });
  it("says nothing is chosen yet when it is empty", () => {
    expect(text()).toBe("Serving: nothing chosen yet");
  });
});

describe("search", () => {
  it("matches a name anywhere in it, ignoring case, most specific first then A to Z", () => {
    expect(C.search(idx, "O").map((id) => idx.byId[id]!.name)).toEqual(["Brooklyn", "Eldoraigne", "Centurion", "Johannesburg", "Pretoria"]);
    expect(C.search(idx, "pre")).toEqual([PTA]);
    expect(C.search(idx, "   ")).toEqual([]);
    expect(C.search(idx, "zzz")).toEqual([]);
  });
});

describe("what goes to the server", () => {
  it("sends exactly the fields the route reads, and nothing the person did not choose", () => {
    expect(C.payloadOf(C.setPresence(C.setRadius(idx, sel(PTA, ELD), 50), "no_fixed_place"))).toEqual({
      area_ids: [PTA, ELD], radius_km: 50, radius_centre_area_id: ELD, presence: "no_fixed_place",
    });
    expect(C.payloadOf(sel(PTA))).toEqual({ area_ids: [PTA], radius_km: null, radius_centre_area_id: null, presence: "online" });
  });
  it("drops a distance that has no area", () => {
    expect(C.payloadOf({ ...sel(), radiusKm: 25, radiusCentreAreaId: PTA })).toMatchObject({ area_ids: [], radius_km: null, radius_centre_area_id: null });
  });
  it("reads the server's answer defensively", () => {
    expect(C.selectionFromServer({ area_ids: [PTA, "bad", 5], radius_km: 25, radius_centre_area_id: PTA, presence: "no_fixed_place" }))
      .toEqual({ areaIds: [PTA], radiusKm: 25, radiusCentreAreaId: PTA, presence: "no_fixed_place" });
    expect(C.selectionFromServer(null)).toEqual(C.emptySelection());
    expect(C.selectionFromServer({ presence: "x", radius_km: "50" }).presence).toBe("online");
  });
});

describe("who is offered the picker", () => {
  it("only a Contributor who chose no fixed location: everyone else sees nothing extra", () => {
    expect(C.offersPicker({ noFixedLocation: true })).toBe(true);
    expect(C.offersPicker({ noFixedLocation: false, lat: -25.7, lng: 28.2 })).toBe(false);
    expect(C.offersPicker({})).toBe(false);
    expect(C.offersPicker(null)).toBe(false);
    expect(C.offersPicker({ noFixedLocation: "yes" })).toBe(false);
  });
});

function fakeFetch(status: number, body: unknown = {}, calls: { path: string; init?: { method?: string; body?: string } }[] = []) {
  const f = (path: string, init?: { method?: string; body?: string }) => {
    calls.push({ path, init });
    if (status === 0) return Promise.reject(new Error("offline"));
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  };
  return { f, calls };
}

describe("the requests", () => {
  it("reads the area index from the public route and keeps only well-formed rows", async () => {
    const { f, calls } = fakeFetch(200, { data: [...AREAS, { id: "bad" }] });
    const r = await C.fetchAreas("", f);
    expect(calls[0]!.path).toBe("/api/v1/service-areas");
    expect(r.ok).toBe(true);
    expect(r.areas).toHaveLength(AREAS.length);
  });
  it("asks for a city's suburbs by parent id", async () => {
    const { f, calls } = fakeFetch(200, { data: [] });
    await C.fetchAreas("?parent=" + PTA, f);
    expect(calls[0]!.path).toBe("/api/v1/service-areas?parent=" + PTA);
  });
  it("answers not-ok (never throws) when the network or the server fails", async () => {
    expect((await C.fetchAreas("", fakeFetch(0).f)).ok).toBe(false);
    expect((await C.fetchAreas("", fakeFetch(500).f)).ok).toBe(false);
    expect((await C.fetchAreas("", fakeFetch(200, { data: "x" }).f)).areas).toEqual([]);
  });
  it("reads the saved choice for the signed-in person, or for a named listing", async () => {
    const a = fakeFetch(200, { area_ids: [PTA], radius_km: null, radius_centre_area_id: null, presence: "online" });
    expect((await C.loadSelection(a.f, null)).selection!.areaIds).toEqual([PTA]);
    expect(a.calls[0]!.path).toBe("/api/contributor/service-areas");
    const b = fakeFetch(200, {});
    await C.loadSelection(b.f, ELD);
    expect(b.calls[0]!.path).toBe("/api/contributor/service-areas?contributor_id=" + ELD);
    expect((await C.loadSelection(fakeFetch(401).f, null)).ok).toBe(false);
    expect((await C.loadSelection(a.f, "not-a-uuid")).ok).toBe(false);
    expect((await C.loadSelection(undefined, null)).ok).toBe(false);
  });
  it("saves with PUT and the exact payload, adding contributor_id only for another listing", async () => {
    const a = fakeFetch(200, { area_ids: [PTA], radius_km: 25, radius_centre_area_id: PTA, presence: "online" });
    const r = await C.saveSelection(a.f, null, C.setRadius(idx, sel(PTA), 25));
    expect(r.ok).toBe(true);
    expect(a.calls[0]!.path).toBe("/api/contributor/service-areas");
    expect(a.calls[0]!.init!.method).toBe("PUT");
    expect(JSON.parse(a.calls[0]!.init!.body!)).toEqual({ area_ids: [PTA], radius_km: 25, radius_centre_area_id: PTA, presence: "online" });
    const b = fakeFetch(200, {});
    await C.saveSelection(b.f, ELD, sel(PTA));
    expect(JSON.parse(b.calls[0]!.init!.body!).contributor_id).toBe(ELD);
  });
  it("turns every refusal into plain words and never shows the server's own text", async () => {
    const cases: [number, string, string][] = [
      [401, "Unauthorized", "signIn"], [403, "Forbidden", "forbidden"], [403, "not_a_contributor", "notReady"], [404, "not_found", "notReady"],
      [429, "Too many requests", "slowDown"], [400, "too_many_areas", "tooMany"], [400, "unknown_area", "generic"], [500, "save_failed", "generic"],
    ];
    const E = S.errors as Record<string, string>;
    for (const [status, error, key] of cases) {
      const r = await C.saveSelection(fakeFetch(status, { error, message: "SECRET internal text" }).f, null, sel(PTA));
      expect(r.ok).toBe(false);
      expect(r.message, `${status} ${error}`).toBe(E[key]);
      expect(r.message).not.toMatch(/SECRET|internal/);
    }
    const off = await C.saveSelection(fakeFetch(0).f, null, sel(PTA));
    expect(off).toMatchObject({ ok: false, reason: "offline", message: E.offline });
  });
  it("refuses to send for a bad id or no fetcher", async () => {
    expect((await C.saveSelection(undefined, null, sel(PTA))).ok).toBe(false);
    expect((await C.saveSelection(fakeFetch(200).f, "nope", sel(PTA))).ok).toBe(false);
  });
});

describe("the words", () => {
  it("the public group says Online in this area; the owner group keeps 'serving' and never says on the map", () => {
    const strings = loadFrontend("map-v2-strings.jsx").MapV2Strings as { online: { title: string; tag: { online: string; noFixedPlace: string }; alsoReaching: string }; serving: Record<string, unknown> };
    expect(strings.online.title).toBe("Online in this area");
    expect(strings.online.tag).toEqual({ online: "Online", noFixedPlace: "No fixed place" });
    expect(strings.online.alsoReaching).toBe("Also reaching this area");
    const owner = JSON.stringify(strings.serving, (_k, v) => (typeof v === "function" ? String(v("Sample", 2)) : v));
    expect(owner).toMatch(/Serving:/);
    expect(owner).not.toMatch(/on the map/i); // C21: a no-pin Contributor is never promised the map
    expect(JSON.stringify(strings.online)).not.toMatch(/serving|on the map/i);
  });
  it("the owner's tag labels are the public ones, so a row and its picker can never disagree", () => {
    const src = readFileSync(join(process.cwd(), "src/frontend/app/serving-areas.jsx"), "utf8");
    expect(src).toMatch(/PubStr\(\)\.tag/);
  });
});
