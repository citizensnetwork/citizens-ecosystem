/**
 * The Place field's pure helpers (src/frontend/app/place-lib.jsx →
 * window.CV_PLACE) plus the wiring that has to stay true for the field to work:
 * the new files are registered in BOTH index.html and the build's appFileOrder,
 * every window.CV_PLACE.* name the screens call exists, and what the field
 * sends is accepted by the real POST /api/activities schema.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createActivitySchema } from "../../lib/schemas/activity";

const root = process.cwd(); // apps/vision when run through its own vitest
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

type Place = { name: string; lat: number | null; lng: number | null };
type Hit = { id: string; label: string; lat: number; lng: number };
type Env = { MAPTILER_KEY?: string };

interface Lib {
  NAME_MAX: number;
  MIN_QUERY: number;
  MAX_RESULTS: number;
  HOME: { lat: number; lng: number };
  EMPTY: Place;
  cleanName(s: unknown): string;
  coordLabel(lat: number, lng: number): string;
  parseCoordPair(q: unknown): { lat: number; lng: number } | null;
  searchUrl(env: Env | null, q: unknown): string | null;
  reverseUrl(env: Env | null, lat: unknown, lng: unknown): string | null;
  parseResults(json: unknown): Hit[];
  parseReverse(json: unknown): string;
  normalise(place: unknown): Place | null;
  kind(place: unknown): "empty" | "text" | "pinned";
  toPayload(place: unknown): Record<string, unknown>;
  rowPlace(row: unknown): { name: string; onMap: boolean };
  demoMapRow(id: string, title: string, type: string, date: string, place: unknown): Record<string, unknown> | null;
}
type TimelineLib = { toPoints(rows: unknown[]): { id: string; lat: number; lng: number; place: string }[] };

function load(): { P: Lib; TL: TimelineLib } {
  const win: { CV_TIMELINE?: TimelineLib; CV_PLACE?: Lib } = {};
  // Same order the page loads them: timeline-lib first, place-lib reads it lazily.
  new Function("window", read("src/frontend/app/timeline-lib.jsx"))(win);
  new Function("window", read("src/frontend/app/place-lib.jsx"))(win);
  if (!win.CV_PLACE || !win.CV_TIMELINE) throw new Error("the libs did not publish their window globals");
  return { P: win.CV_PLACE, TL: win.CV_TIMELINE };
}
const { P, TL } = load();

const KEY: Env = { MAPTILER_KEY: "abc123" };
const feature = (over: Record<string, unknown> = {}) => ({
  id: "place.1",
  text: "Hatfield",
  place_name: "Hatfield, City of Tshwane Metropolitan Municipality, South Africa",
  center: [28.2431, -25.7508],
  ...over,
});

describe("cleanName", () => {
  it("trims, collapses runs of whitespace and tolerates non-strings", () => {
    expect(P.cleanName("  Mamelodi \n  community   hall ")).toBe("Mamelodi community hall");
    expect(P.cleanName(null)).toBe("");
    expect(P.cleanName(undefined)).toBe("");
    expect(P.cleanName(42)).toBe("42");
  });
  it("stops at the 300 characters the API allows", () => {
    expect(P.NAME_MAX).toBe(300);
    expect(P.cleanName("a".repeat(500))).toHaveLength(300);
  });
  it("never leaves half an emoji at the cut", () => {
    const out = P.cleanName("a".repeat(299) + "😀");
    expect(out).toBe("a".repeat(299));
  });
});

describe("parseCoordPair", () => {
  it("reads latitude then longitude, however the numbers are separated", () => {
    const want = { lat: -25.7461, lng: 28.1881 };
    expect(P.parseCoordPair("-25.7461, 28.1881")).toEqual(want);
    expect(P.parseCoordPair("-25.7461,28.1881")).toEqual(want);
    expect(P.parseCoordPair("  -25.7461 28.1881 ")).toEqual(want);
    expect(P.parseCoordPair("-25.7461; 28.1881")).toEqual(want);
  });
  it("accepts whole-number coordinates", () => {
    expect(P.parseCoordPair("-26, 28")).toEqual({ lat: -26, lng: 28 });
  });
  it("rejects null island, out-of-range numbers and anything that is not exactly a pair", () => {
    expect(P.parseCoordPair("0, 0")).toBeNull();
    expect(P.parseCoordPair("91, 28")).toBeNull();
    expect(P.parseCoordPair("-25, 181")).toBeNull();
    expect(P.parseCoordPair("Hatfield")).toBeNull();
    expect(P.parseCoordPair("1, 2, 3")).toBeNull();
    expect(P.parseCoordPair("-25.7461")).toBeNull();
    expect(P.parseCoordPair("Hatfield 0083")).toBeNull();
    expect(P.parseCoordPair("")).toBeNull();
    expect(P.parseCoordPair(null)).toBeNull();
  });
});

describe("searchUrl", () => {
  it("builds the MapTiler geocoding URL with the key encoded and a Pretoria nudge", () => {
    const url = P.searchUrl({ MAPTILER_KEY: "k e&y" }, "  Hatfield   Pretoria ");
    expect(url).toBe(
      "https://api.maptiler.com/geocoding/Hatfield%20Pretoria.json?key=k%20e%26y&limit=5&language=en&proximity=28.19,-25.75",
    );
  });
  it("encodes characters that would change the path or the query", () => {
    const url = P.searchUrl(KEY, "St Mary's/Hall? #2")!;
    expect(url).toContain("/geocoding/St%20Mary's%2FHall%3F%20%232.json?");
    expect(url.split("?").length).toBe(2);
  });
  it("asks nothing without a usable key, so the field degrades to plain text", () => {
    expect(P.searchUrl({}, "Hatfield")).toBeNull();
    expect(P.searchUrl(null, "Hatfield")).toBeNull();
    expect(P.searchUrl({ MAPTILER_KEY: "" }, "Hatfield")).toBeNull();
    expect(P.searchUrl({ MAPTILER_KEY: "REPLACE_WITH_KEY" }, "Hatfield")).toBeNull();
  });
  it("waits for three characters before spending a request", () => {
    expect(P.searchUrl(KEY, "Ha")).toBeNull();
    expect(P.searchUrl(KEY, "  Ha  ")).toBeNull();
    expect(P.searchUrl(KEY, "Hat")).not.toBeNull();
  });
  it("never sends a coordinate pair to the forward geocoder (it would read it longitude first)", () => {
    expect(P.searchUrl(KEY, "-25.7461, 28.1881")).toBeNull();
  });
});

describe("reverseUrl", () => {
  it("puts longitude first, as MapTiler expects, and rounds to about 0.1 m", () => {
    expect(P.reverseUrl(KEY, -25.74827, 28.2321195297)).toBe(
      "https://api.maptiler.com/geocoding/28.23212,-25.74827.json?key=abc123&limit=1&language=en",
    );
  });
  it("needs a key and a real spot", () => {
    expect(P.reverseUrl({}, -25.7, 28.2)).toBeNull();
    expect(P.reverseUrl(KEY, 0, 0)).toBeNull();
    expect(P.reverseUrl(KEY, null, 28.2)).toBeNull();
    expect(P.reverseUrl(KEY, 95, 28.2)).toBeNull();
  });
});

describe("parseResults", () => {
  it("turns features into choices with the label, latitude and longitude the right way round", () => {
    const [h] = P.parseResults({ features: [feature()] });
    expect(h).toEqual({
      id: "place.1",
      label: "Hatfield, City of Tshwane Metropolitan Municipality, South Africa",
      lat: -25.7508,
      lng: 28.2431,
    });
  });
  it("uses the short name when there is no full one", () => {
    const [h] = P.parseResults({ features: [feature({ place_name: undefined })] });
    expect(h!.label).toBe("Hatfield");
  });
  it("drops results it cannot place and never plots them somewhere made up", () => {
    const out = P.parseResults({
      features: [
        feature({ id: "ok" }),
        feature({ id: "no-centre", center: undefined }),
        feature({ id: "null-centre", center: [null, null] }),
        feature({ id: "half", center: [28.2] }),
        feature({ id: "text-centre", center: ["28.2", "-25.7"] }),
        feature({ id: "island", center: [0, 0], place_name: "Null Island" }),
        feature({ id: "off-planet", center: [200, -25], place_name: "Elsewhere" }),
        feature({ id: "no-label", place_name: "", text: "" }),
        null,
      ],
    });
    expect(out.map((r) => r.id)).toEqual(["ok"]);
  });
  it("collapses results that read the same and stops at five", () => {
    const dup = P.parseResults({
      features: [feature({ id: "a" }), feature({ id: "b", place_name: "HATFIELD, City of Tshwane Metropolitan Municipality, South Africa" })],
    });
    expect(dup).toHaveLength(1);
    const many = P.parseResults({
      features: Array.from({ length: 9 }, (_, i) => feature({ id: "p" + i, place_name: "Place " + i })),
    });
    expect(many).toHaveLength(P.MAX_RESULTS);
    expect(P.MAX_RESULTS).toBe(5);
  });
  it("survives a body that is not a result list", () => {
    expect(P.parseResults(null)).toEqual([]);
    expect(P.parseResults({})).toEqual([]);
    expect(P.parseResults({ features: "nope" })).toEqual([]);
    expect(P.parseResults({ features: [] })).toEqual([]);
    expect(P.parseResults("<html>")).toEqual([]);
  });
});

describe("parseReverse", () => {
  it("takes the first (most specific) name", () => {
    expect(P.parseReverse({ features: [feature({ place_name: "Festival Street 353, Tshwane" }), feature()] })).toBe("Festival Street 353, Tshwane");
  });
  it("is empty when MapTiler knows nothing there", () => {
    expect(P.parseReverse({ features: [] })).toBe("");
    expect(P.parseReverse(null)).toBe("");
    expect(P.parseReverse({})).toBe("");
  });
});

describe("normalise, kind and toPayload", () => {
  it("sends nothing at all when there is no place, so logging is unchanged", () => {
    for (const p of [null, undefined, P.EMPTY, { name: "   ", lat: null, lng: null }, { name: "", lat: 0, lng: 0 }]) {
      expect(P.normalise(p)).toBeNull();
      expect(P.kind(p)).toBe("empty");
      expect(P.toPayload(p)).toEqual({});
    }
  });
  it("sends a plain name with no coordinates", () => {
    const p = { name: "  Mamelodi community hall ", lat: null, lng: null };
    expect(P.kind(p)).toBe("text");
    expect(P.toPayload(p)).toEqual({ location_name: "Mamelodi community hall" });
  });
  it("sends all three fields for a name and a real spot, rounded to about 0.1 m", () => {
    const p = { name: "Hatfield", lat: -25.750833114245893, lng: 28.243055418133736 };
    expect(P.kind(p)).toBe("pinned");
    expect(P.toPayload(p)).toEqual({ latitude: -25.750833, longitude: 28.243055, location_name: "Hatfield" });
  });
  it("applies the Timeline Map's rule: null island and out-of-range pins become a plain name", () => {
    expect(P.toPayload({ name: "Somewhere", lat: 0, lng: 0 })).toEqual({ location_name: "Somewhere" });
    expect(P.toPayload({ name: "Somewhere", lat: 91, lng: 28 })).toEqual({ location_name: "Somewhere" });
    expect(P.toPayload({ name: "Somewhere", lat: -25, lng: 181 })).toEqual({ location_name: "Somewhere" });
  });
  it("never sends half a coordinate pair", () => {
    expect(P.toPayload({ name: "Somewhere", lat: -25.7, lng: null })).toEqual({ location_name: "Somewhere" });
    expect(P.toPayload({ name: "Somewhere", lat: null, lng: 28.2 })).toEqual({ location_name: "Somewhere" });
    expect(P.toPayload({ name: "", lat: -25.7, lng: null })).toEqual({});
  });
  it("names a pin by its coordinates when it has no name, so the list never shows a blank place", () => {
    const out = P.toPayload({ name: "", lat: -25.7461234, lng: 28.1881234 });
    expect(out).toEqual({ latitude: -25.746123, longitude: 28.188123, location_name: "Pin at -25.74612, 28.18812" });
  });
  it("caps the name at what the API accepts", () => {
    const out = P.toPayload({ name: "x".repeat(400), lat: null, lng: null });
    expect((out.location_name as string).length).toBe(300);
  });
  it("is always accepted by the real POST /api/activities schema", () => {
    const base = { title: "Food drive", type: "outreach" as const, date: "2026-10-16" };
    const places: unknown[] = [
      null,
      { name: "Plain name", lat: null, lng: null },
      { name: "Hatfield", lat: -25.7508, lng: 28.2431 },
      { name: "", lat: -25.7508, lng: 28.2431 },
      { name: "y".repeat(999), lat: -25.7508, lng: 28.2431 },
      { name: "z", lat: 0, lng: 0 },
      { name: "z", lat: 90, lng: 180 },
      { name: "z", lat: -90, lng: -180 },
    ];
    for (const p of places) {
      const r = createActivitySchema.safeParse({ ...base, ...P.toPayload(p) });
      expect(r.success, JSON.stringify(p)).toBe(true);
    }
  });
});

describe("rowPlace (a saved activity in the list)", () => {
  it("shows the saved name and whether the Timeline Map can plot the row", () => {
    expect(P.rowPlace({ location_name: "Hatfield", latitude: -25.75, longitude: 28.24 })).toEqual({ name: "Hatfield", onMap: true });
    expect(P.rowPlace({ location_name: "Hatfield", latitude: null, longitude: null })).toEqual({ name: "Hatfield", onMap: false });
    expect(P.rowPlace({ location_name: "Hatfield", latitude: 0, longitude: 0 })).toEqual({ name: "Hatfield", onMap: false });
  });
  it("copes with rows that carry no place at all", () => {
    expect(P.rowPlace({})).toEqual({ name: "", onMap: false });
    expect(P.rowPlace({ location_name: null })).toEqual({ name: "", onMap: false });
    expect(P.rowPlace(null)).toEqual({ name: "", onMap: false });
    expect(P.rowPlace(undefined)).toEqual({ name: "", onMap: false });
  });
  it("agrees with the map: onMap exactly when toPoints would plot the row", () => {
    const rows = [
      { id: "a", date: "2026-06-28", latitude: -25.7, longitude: 28.2, location_name: "A" },
      { id: "b", date: "2026-06-28", latitude: null, longitude: null, location_name: "B" },
      { id: "c", date: "2026-06-28", latitude: 0, longitude: 0, location_name: "C" },
      { id: "d", date: "2026-06-28", latitude: -25.7, longitude: null, location_name: "D" },
    ];
    const plotted = TL.toPoints(rows).map((p) => p.id);
    expect(rows.filter((r) => P.rowPlace(r).onMap).map((r) => r.id)).toEqual(plotted);
  });
});

describe("demoMapRow (the demo's Timeline Map)", () => {
  it("builds a row the map plots, with the place it was given", () => {
    const row = P.demoMapRow("act-1", "Food drive", "outreach", "2026-10-16", { name: "Hatfield", lat: -25.7508, lng: 28.2431 });
    expect(row).not.toBeNull();
    const [pt] = TL.toPoints([row]);
    expect(pt).toMatchObject({ id: "act-1", lat: -25.7508, lng: 28.2431, place: "Hatfield" });
  });
  it("invents no participant count", () => {
    const row = P.demoMapRow("act-1", "Food drive", "outreach", "2026-10-16", { name: "Hatfield", lat: -25.7508, lng: 28.2431 });
    expect(row!.participant_count).toBe(0);
  });
  it("makes no map row for a place without a real spot", () => {
    expect(P.demoMapRow("a", "T", "event", "2026-10-16", null)).toBeNull();
    expect(P.demoMapRow("a", "T", "event", "2026-10-16", { name: "Just a name", lat: null, lng: null })).toBeNull();
    expect(P.demoMapRow("a", "T", "event", "2026-10-16", { name: "Island", lat: 0, lng: 0 })).toBeNull();
  });
});

describe("wiring that must stay true for the field to work", () => {
  it("registers place-lib.jsx and place-field.jsx in index.html AND appFileOrder, after timeline-lib and before views", () => {
    const html = read("src/frontend/index.html");
    const build = read("scripts/build-frontend.js");
    for (const f of ["place-lib.jsx", "place-field.jsx"]) {
      expect(html, f + " in index.html").toContain('src="app/' + f);
      expect(build, f + " in appFileOrder").toContain("'" + f + "'");
      expect(html.indexOf("app/" + f)).toBeGreaterThan(html.indexOf("app/timeline-lib.jsx"));
      expect(html.indexOf("app/" + f)).toBeLessThan(html.indexOf("app/views.jsx"));
      expect(build.indexOf("'" + f + "'")).toBeGreaterThan(build.indexOf("'timeline-lib.jsx'"));
      expect(build.indexOf("'" + f + "'")).toBeLessThan(build.indexOf("'views.jsx'"));
    }
    // The field reads CV_PLACE at load, so the lib must come first.
    expect(html.indexOf("app/place-lib.jsx")).toBeLessThan(html.indexOf("app/place-field.jsx"));
    expect(build.indexOf("'place-lib.jsx'")).toBeLessThan(build.indexOf("'place-field.jsx'"));
  });
  it("only calls window.CV_PLACE names that exist (these files have no type checker)", () => {
    const names = (src: string, re: RegExp) => [...src.matchAll(re)].map((m) => m[1]!);
    const field = names(read("src/frontend/app/place-field.jsx"), /\bP\.([A-Za-z_]+)/g);
    const views = names(read("src/frontend/app/views.jsx"), /\b(?:PL|window\.CV_PLACE)\.([A-Za-z_]+)/g);
    const win: { CV_TIMELINE?: unknown; CV_PLACE?: Record<string, unknown> } = {};
    new Function("window", read("src/frontend/app/timeline-lib.jsx"))(win);
    new Function("window", read("src/frontend/app/place-lib.jsx"))(win);
    const have = Object.keys(win.CV_PLACE!);
    expect(field.length).toBeGreaterThan(5);
    expect(views.length).toBeGreaterThan(2);
    for (const n of new Set([...field, ...views])) expect(have, n + " is not exported by place-lib.jsx").toContain(n);
  });
  it("is allowed by the CSP as shipped: geocoding goes to the MapTiler host already in connect-src", () => {
    const cfg = read("next.config.ts");
    expect(cfg).toMatch(/connect-src[^"]*https:\/\/api\.maptiler\.com/);
    expect(read("src/frontend/app/place-lib.jsx")).toContain("https://api.maptiler.com/geocoding/");
    expect(cfg).not.toMatch(/script-src[^"]*'unsafe-inline'/);
  });
});
