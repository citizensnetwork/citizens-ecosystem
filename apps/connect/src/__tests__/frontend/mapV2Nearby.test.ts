/**
 * Map v2 Nearby list (`src/frontend/app/map-v2-nearby.jsx`, tracker P2-01, founder D2: the sheet sits beside the profile page).
 *
 * The pure parts: the distance between two pins, which listings are "nearby" and in what order, and how a distance reads.
 * The order is distance, then name, then id. It must never depend on how popular or active a listing is
 * (VISION: the small are honoured), so a test feeds in every popularity-looking field and checks nothing moves.
 * e2e/map-v2-nearby.spec.ts drives the list in the sheet with real touch.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFrontend } from "./support/loadFrontend";

type Marker = { id: string; type: string; title?: string; lat?: unknown; lng?: unknown; [k: string]: unknown };
type Row = { marker: Marker; meters: number };
type Api = {
  MAX_ROWS: number; MAX_METERS: number;
  metersBetween: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number;
  rank: (origin: unknown, pool: unknown, opts?: { max?: number; maxMeters?: number; skip?: (m: Marker) => boolean }) => Row[];
  distanceText: (m: number, S: Record<string, unknown>) => string;
};
let N: Api;
let S: { under: string; metres: (n: number) => string; km: (n: number) => string };

beforeAll(() => {
  const win: Record<string, unknown> = {};
  loadFrontend("map-v2-nearby.jsx", win);
  N = win.MapV2Nearby as Api;
  S = (loadFrontend("map-v2-strings.jsx").MapV2Strings as { sheet: { nearby: typeof S } }).sheet.nearby;
});

// central Pretoria; 0.001 degrees of latitude is about 111 m
const O = { lat: -25.7479, lng: 28.2293 };
const at = (id: string, type: string, dLat: number, dLng = 0, extra: Record<string, unknown> = {}): Marker => ({
  id, type, title: id, lat: O.lat + dLat, lng: O.lng + dLng, ...extra,
});

describe("metersBetween (haversine)", () => {
  it("is zero for the same point and the same both ways", () => {
    expect(N.metersBetween(O, O)).toBe(0);
    const p = { lat: O.lat + 0.01, lng: O.lng + 0.02 };
    expect(N.metersBetween(O, p)).toBeCloseTo(N.metersBetween(p, O), 6);
  });

  it("one hundredth of a degree of latitude is about 1,112 m anywhere", () => {
    expect(N.metersBetween(O, { lat: O.lat + 0.01, lng: O.lng })).toBeGreaterThan(1111);
    expect(N.metersBetween(O, { lat: O.lat + 0.01, lng: O.lng })).toBeLessThan(1113);
  });

  it("a degree of longitude is shorter by the cosine of the latitude (about 100.2 km at Pretoria)", () => {
    const m = N.metersBetween({ lat: -25.75, lng: 28 }, { lat: -25.75, lng: 29 });
    expect(m).toBeGreaterThan(100_000);
    expect(m).toBeLessThan(100_400);
  });
});

describe("rank: who is nearby and in what order", () => {
  it("lists the closest first", () => {
    const pool = [at("far", "place", 0.02), at("near", "place", 0.001), at("mid", "event", 0.01)];
    expect(N.rank(O, pool).map((r) => r.marker.id)).toEqual(["near", "mid", "far"]);
  });

  it("mixes Contributors, Places and Events by distance alone, no kind above another", () => {
    const pool = [at("e", "event", 0.003), at("c", "contributor", 0.002), at("p", "place", 0.001)];
    expect(N.rank(O, pool).map((r) => r.marker.type)).toEqual(["place", "contributor", "event"]);
  });

  it("popularity, followers, activity and dates never move a listing (the small are honoured)", () => {
    const quiet = at("quiet", "contributor", 0.001);
    const busy = at("busy", "contributor", 0.002, 0, { followers: 99999, nextEventAt: Date.now(), lastActivityAt: Date.now(), votes: 5000, isLive: true });
    expect(N.rank(O, [busy, quiet]).map((r) => r.marker.id)).toEqual(["quiet", "busy"]);
    // and the other way round: the busy one nearer still wins only because it is nearer
    const busyNear = at("busy", "contributor", 0.0005, 0, { followers: 99999 });
    const quietFar = at("quiet", "contributor", 0.001);
    expect(N.rank(O, [quietFar, busyNear]).map((r) => r.marker.id)).toEqual(["busy", "quiet"]);
  });

  it("breaks an exact tie by name, then id, so the list is the same every time", () => {
    const pool = [at("b-id", "place", 0.001, 0, { title: "Bakery" }), at("a-id", "place", 0.001, 0, { title: "Bakery" }), at("z-id", "place", 0.001, 0, { title: "Alpha" })];
    const first = N.rank(O, pool).map((r) => r.marker.id);
    expect(first).toEqual(["z-id", "a-id", "b-id"]);
    expect(N.rank(O, [...pool].reverse()).map((r) => r.marker.id)).toEqual(first);
  });

  it("keeps at most 8 rows by default, and honours max", () => {
    const pool = Array.from({ length: 20 }, (_, i) => at("m" + i, "place", 0.0005 * (i + 1)));
    expect(N.MAX_ROWS).toBe(8);
    expect(N.rank(O, pool)).toHaveLength(8);
    expect(N.rank(O, pool, { max: 3 }).map((r) => r.marker.id)).toEqual(["m0", "m1", "m2"]);
  });

  it("leaves out anything beyond 10 km (and a custom radius is honoured)", () => {
    const pool = [at("in", "place", 0.08), at("out", "place", 0.1)]; // about 8.9 km and 11.1 km
    expect(N.MAX_METERS).toBe(10_000);
    expect(N.rank(O, pool).map((r) => r.marker.id)).toEqual(["in"]);
    expect(N.rank(O, pool, { maxMeters: 20_000 }).map((r) => r.marker.id)).toEqual(["in", "out"]);
  });

  it("leaves out Impact ideas and anything without two real coordinates", () => {
    const pool: Marker[] = [
      at("idea", "idea", 0.001),
      { id: "nolat", type: "place", title: "x", lng: O.lng },
      { id: "nolng", type: "place", title: "x", lat: O.lat },
      { id: "nan", type: "place", title: "x", lat: NaN, lng: O.lng },
      { id: "str", type: "place", title: "x", lat: String(O.lat), lng: String(O.lng) },
      { id: "null", type: "contributor", title: "x", lat: null, lng: null },
      at("ok", "place", 0.002),
    ];
    expect(N.rank(O, pool).map((r) => r.marker.id)).toEqual(["ok"]);
  });

  it("drops what skip() says is already on the sheet", () => {
    const pool = [at("self", "contributor", 0), at("own-event", "event", 0.0001), at("other", "place", 0.001)];
    const rows = N.rank(O, pool, { skip: (m) => m.id === "self" || m.id === "own-event" });
    expect(rows.map((r) => r.marker.id)).toEqual(["other"]);
  });

  it("returns the distance in metres with each row, and never changes the pool", () => {
    const pool = [at("b", "place", 0.002), at("a", "place", 0.001)];
    const copy = JSON.parse(JSON.stringify(pool));
    const rows = N.rank(O, pool);
    expect(rows[0].meters).toBeGreaterThan(110);
    expect(rows[0].meters).toBeLessThan(112);
    expect(pool).toEqual(copy);
  });

  it("is empty, never an error, for a listing with no pin, a missing pool or a pool that is not a list", () => {
    expect(N.rank(null, [at("a", "place", 0.001)])).toEqual([]);
    expect(N.rank({ lat: undefined, lng: 28 }, [at("a", "place", 0.001)])).toEqual([]);
    expect(N.rank({ lat: "x", lng: "y" }, [at("a", "place", 0.001)])).toEqual([]);
    expect(N.rank(O, undefined)).toEqual([]);
    expect(N.rank(O, { length: 1 })).toEqual([]);
    expect(N.rank(O, [null, undefined, 3, at("a", "place", 0.001)] as unknown as Marker[]).map((r) => r.marker.id)).toEqual(["a"]);
  });
});

describe("distanceText", () => {
  it("says 'under 100 m' for anything closer than 100 m, including the same spot", () => {
    expect(N.distanceText(0, S)).toBe("Under 100 m away");
    expect(N.distanceText(99.9, S)).toBe("Under 100 m away");
  });

  it("rounds to the nearest 50 m below a kilometre, so it never claims precision a pin does not have", () => {
    expect(N.distanceText(100, S)).toBe("100 m away");
    expect(N.distanceText(124, S)).toBe("100 m away");
    expect(N.distanceText(126, S)).toBe("150 m away");
    expect(N.distanceText(949, S)).toBe("950 m away");
  });

  it("switches to kilometres, with one decimal under 10 km and a whole number from 10 km", () => {
    expect(N.distanceText(980, S)).toBe("1 km away");   // 980 would round to 1,000 m: that reads better as 1 km
    expect(N.distanceText(1234, S)).toBe("1.2 km away");
    expect(N.distanceText(9949, S)).toBe("9.9 km away");
    expect(N.distanceText(10_000, S)).toBe("10 km away");
    expect(N.distanceText(12_400, S)).toBe("12 km away");
    expect(N.distanceText(12_600, S)).toBe("13 km away");
  });
});

describe("the strings and the wiring", () => {
  it("the Nearby strings exist, are short and say 'away'", () => {
    const n = (loadFrontend("map-v2-strings.jsx").MapV2Strings as { sheet: { nearby: Record<string, unknown> } }).sheet.nearby;
    expect(n.title).toBe("Nearby");
    expect(String(n.hint).split(/\s+/).length).toBeLessThanOrEqual(12);
    expect(S.under).toMatch(/away$/);
    expect(S.metres(350)).toBe("350 m away");
    expect(S.km(1.2)).toBe("1.2 km away");
  });

  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("the new file is registered in index.html and the build order, before the sheet that uses it", () => {
    const html = read("src/frontend/index.html");
    expect(html).toContain('src="app/map-v2-nearby.jsx?v=');
    expect(html.indexOf("app/map-v2-nearby.jsx")).toBeLessThan(html.indexOf("app/map-v2-sheet.jsx"));
    const build = read("scripts/build-frontend.js");
    expect(build).toContain("'map-v2-nearby.jsx'");
    expect(build.indexOf("'map-v2-nearby.jsx'")).toBeLessThan(build.indexOf("'map-v2-sheet.jsx'"));
  });

  it("the sheet shows the list only from the map's own markers, and a pick goes back to the home screen's selection", () => {
    const sheet = read("src/frontend/app/map-v2-sheet.jsx");
    expect(sheet).toContain("function MapV2Sheet({ id, type, onClose, onOccupy, nearby, onPick, expanded, view })");
    expect(sheet).toContain("N.rank(item, nearby");
    const home = read("src/frontend/app/home.jsx");
    expect(home).toContain("nearby: markers");
    expect(home).toContain("onPick: (id, t) => openSheet(id, t, sheet.view)");
  });
});
