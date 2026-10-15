/**
 * The Timeline Map's pure helpers (src/frontend/app/timeline-lib.jsx →
 * window.CV_TIMELINE) plus the wiring that has to stay true for the map to
 * load: the vendored MapLibre equals Connect's copy, and the new files are
 * registered in BOTH index.html and the build's appFileOrder (a screen file
 * missing from one works in dev and breaks in production).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd(); // apps/vision when run through its own vitest
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

type Pt = { id: string; title: string; type: string; date: string; t: number; lat: number; lng: number; people: number; place: string; dept: string };
type Win = { from: number; to: number; span: number };
type Sum = { count: number; people: number };

interface Lib {
  DAY_MS: number;
  SPANS: number[];
  dayNumber(iso: unknown): number | null;
  isoFromDay(n: number): string;
  validCoord(lat: unknown, lng: unknown): boolean;
  toPoints(rows: unknown[]): Pt[];
  featureCollection(points: Pt[]): { type: string; features: { geometry: { coordinates: number[] }; properties: Record<string, unknown> }[] };
  extent(points: Pt[]): { min: number; max: number } | null;
  bounds(points: Pt[]): number[][] | null;
  windowAt(cursor: number, span: number): Win;
  previousWindow(win: Win): Win;
  summarise(points: Pt[], win: Win, types?: Set<string>): Sum;
  dotRadius(people: number): number;
  ringRadius(people: number): number;
  dotRadiusExpr(): unknown[];
  ringRadiusExpr(): unknown[];
  windowFilter(win: Win, types?: Set<string>): unknown[];
  NOTHING: unknown[];
  playStep(span: number): number;
  summaryLine(cur: Sum, prev: Sum | null, compare: boolean): string;
  BLANK_STYLE: { version: number; sources: object; layers: { id: string; type: string }[] };
  hasKey(env: unknown): boolean;
  styleUrl(env: unknown, theme?: string): string | null;
  isKeyRefusal(err: unknown): boolean;
}

function loadLib(): Lib {
  const win: { CV_TIMELINE?: Lib } = {};
  new Function("window", read("src/frontend/app/timeline-lib.jsx"))(win);
  if (!win.CV_TIMELINE) throw new Error("timeline-lib.jsx did not publish window.CV_TIMELINE");
  return win.CV_TIMELINE;
}
const TL = loadLib();

const row = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  title: "Food drive",
  type: "outreach",
  date: "2026-06-28",
  latitude: -25.7461,
  longitude: 28.1881,
  participant_count: 218,
  location_name: "Pretoria CBD",
  department_name: "Community Projects",
  ...over,
});

describe("dates are whole UTC days", () => {
  it("round-trips a real date", () => {
    const n = TL.dayNumber("2026-06-28");
    expect(n).toBeTypeOf("number");
    expect(TL.isoFromDay(n as number)).toBe("2026-06-28");
    expect(TL.dayNumber("2026-06-29")! - n!).toBe(1);
  });
  it("accepts a timestamp suffix but rejects dates that are not on the calendar", () => {
    expect(TL.dayNumber("2026-06-28T10:00:00Z")).toBe(TL.dayNumber("2026-06-28"));
    expect(TL.dayNumber("2026-02-31")).toBeNull();
    expect(TL.dayNumber("2026-13-01")).toBeNull();
    expect(TL.dayNumber("28 June 2026")).toBeNull();
    expect(TL.dayNumber(null)).toBeNull();
    expect(TL.dayNumber(undefined)).toBeNull();
  });
});

describe("coordinates are never trusted", () => {
  it("accepts a real place", () => {
    expect(TL.validCoord(-25.7461, 28.1881)).toBe(true);
    expect(TL.validCoord("-25.7461", "28.1881")).toBe(true);
  });
  it("rejects null island, null, text and out-of-range values", () => {
    expect(TL.validCoord(0, 0)).toBe(false);
    expect(TL.validCoord(null, 28)).toBe(false);
    expect(TL.validCoord(-25, null)).toBe(false);
    expect(TL.validCoord(undefined, undefined)).toBe(false);
    expect(TL.validCoord("abc", 28)).toBe(false);
    expect(TL.validCoord(91, 28)).toBe(false);
    expect(TL.validCoord(-25, 181)).toBe(false);
    expect(TL.validCoord(Number.NaN, 28)).toBe(false);
  });
});

describe("toPoints and featureCollection", () => {
  it("keeps good rows and drops the ones that cannot be placed or dated", () => {
    const pts = TL.toPoints([
      row(),
      row({ id: "bad-coord", latitude: null }),
      row({ id: "bad-date", date: "soon" }),
      row({ id: "null-island", latitude: 0, longitude: 0 }),
      null,
    ]);
    expect(pts.map((p) => p.id)).toEqual(["a1"]);
  });
  it("normalises people, title, type and ids", () => {
    const [p] = TL.toPoints([row({ id: 7, title: "", type: null, participant_count: 12.6 })]);
    expect(p!.id).toBe("7");
    expect(p!.title).toBe("Untitled activity");
    expect(p!.type).toBe("other");
    expect(p!.people).toBe(13);
    const [q] = TL.toPoints([row({ participant_count: -5 })]);
    expect(q!.people).toBe(0);
    const [r] = TL.toPoints([row({ participant_count: null })]);
    expect(r!.people).toBe(0);
  });
  it("writes GeoJSON as [longitude, latitude] with the day number the layers filter on", () => {
    const pts = TL.toPoints([row()]);
    const fc = TL.featureCollection(pts);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features[0]!.geometry.coordinates).toEqual([28.1881, -25.7461]);
    expect(fc.features[0]!.properties.t).toBe(TL.dayNumber("2026-06-28"));
    expect(fc.features[0]!.properties.people).toBe(218);
  });
  it("copes with nothing", () => {
    expect(TL.toPoints([])).toEqual([]);
    expect(TL.extent([])).toBeNull();
    expect(TL.bounds([])).toBeNull();
    expect(TL.featureCollection([]).features).toEqual([]);
  });
});

describe("extent and bounds", () => {
  const pts = TL.toPoints([
    row({ id: "a", date: "2026-05-01", latitude: -25.5, longitude: 28.0 }),
    row({ id: "b", date: "2026-06-30", latitude: -25.9, longitude: 28.4 }),
  ]);
  it("spans the earliest to the latest day", () => {
    expect(TL.extent(pts)).toEqual({ min: TL.dayNumber("2026-05-01"), max: TL.dayNumber("2026-06-30") });
  });
  it("is [[west, south], [east, north]]", () => {
    expect(TL.bounds(pts)).toEqual([[28.0, -25.9], [28.4, -25.5]]);
  });
});

describe("the playback window", () => {
  it("is the span days ending on the cursor, inclusive", () => {
    const w = TL.windowAt(100, 30);
    expect(w).toEqual({ from: 71, to: 100, span: 30 });
    expect(w.to - w.from + 1).toBe(30);
  });
  it("never has a span below one day", () => {
    expect(TL.windowAt(100, 0).span).toBe(1);
    expect(TL.windowAt(100, -4).span).toBe(1);
  });
  it("has a previous window of the same length that ends the day before", () => {
    const w = TL.windowAt(100, 30);
    const p = TL.previousWindow(w);
    expect(p.span).toBe(30);
    expect(p.to).toBe(w.from - 1);
    expect(p.to - p.from + 1).toBe(30);
  });
  it("moves a quarter of the window per play tick, at least a day", () => {
    expect(TL.playStep(30)).toBe(8);
    expect(TL.playStep(7)).toBe(2);
    expect(TL.playStep(1)).toBe(1);
  });
  it("offers the four spans the screen shows", () => {
    expect(TL.SPANS).toEqual([7, 30, 90, 365]);
  });
});

describe("summarise", () => {
  const pts = TL.toPoints([
    row({ id: "a", date: "2026-06-10", participant_count: 10, type: "outreach" }),
    row({ id: "b", date: "2026-06-20", participant_count: 30, type: "event" }),
    row({ id: "c", date: "2026-05-01", participant_count: 5, type: "event" }),
  ]);
  const june = TL.windowAt(TL.dayNumber("2026-06-30")!, 30);
  it("counts activities and people inside the window only", () => {
    expect(TL.summarise(pts, june)).toEqual({ count: 2, people: 40 });
  });
  it("honours the type filter, and an empty filter means all types", () => {
    expect(TL.summarise(pts, june, new Set(["event"]))).toEqual({ count: 1, people: 30 });
    expect(TL.summarise(pts, june, new Set())).toEqual({ count: 2, people: 40 });
  });
  it("includes both ends of the window", () => {
    const exact = TL.windowAt(TL.dayNumber("2026-06-10")!, 1);
    expect(TL.summarise(pts, exact)).toEqual({ count: 1, people: 10 });
  });
});

describe("summaryLine", () => {
  it("puts the count beside the people and pluralises", () => {
    expect(TL.summaryLine({ count: 1, people: 1 }, null, false)).toBe("1 activity · 1 person reached");
    expect(TL.summaryLine({ count: 3, people: 40 }, null, false)).toBe("3 activities · 40 people reached");
    expect(TL.summaryLine({ count: 0, people: 0 }, null, false)).toBe("0 activities · 0 people reached");
  });
  it("adds the change against the window before when comparing", () => {
    const up = TL.summaryLine({ count: 3, people: 40 }, { count: 2, people: 30 }, true);
    expect(up).toContain("+10 vs the previous window (30 people)");
    const down = TL.summaryLine({ count: 1, people: 5 }, { count: 2, people: 30 }, true);
    expect(down).toContain("−25 vs the previous window");
    const same = TL.summaryLine({ count: 1, people: 5 }, { count: 1, people: 5 }, true);
    expect(same).toContain("0 vs the previous window");
  });
});

// A just-big-enough evaluator for the arithmetic expressions the map layers use,
// so the radius written for MapLibre provably equals the radius the code computes.
function evalExpr(e: unknown, people: number): number {
  if (typeof e === "number") return e;
  const [op, ...args] = e as [string, ...unknown[]];
  const v = args.map((a) => (Array.isArray(a) && a[0] === "get" ? people : evalExpr(a, people)));
  switch (op) {
    case "+": return v[0]! + v[1]!;
    case "*": return v[0]! * v[1]!;
    case "min": return Math.min(v[0]!, v[1]!);
    case "max": return Math.max(v[0]!, v[1]!);
    case "sqrt": return Math.sqrt(v[0]!);
    default: throw new Error("unexpected operator " + op);
  }
}

describe("ring and dot sizes", () => {
  it("grow with the people reached and stop at a cap", () => {
    expect(TL.ringRadius(0)).toBe(14);
    expect(TL.ringRadius(100)).toBeGreaterThan(TL.ringRadius(10));
    expect(TL.ringRadius(10_000_000)).toBe(14 + 34);
    expect(TL.dotRadius(0)).toBe(5);
    expect(TL.dotRadius(10_000_000)).toBe(5 + 9);
    expect(TL.dotRadius(-3)).toBe(5);
  });
  it("match the MapLibre expressions at every size", () => {
    for (const people of [0, 1, 4, 25, 218, 1000, 100000]) {
      expect(evalExpr(TL.dotRadiusExpr(), people)).toBeCloseTo(TL.dotRadius(people), 10);
      expect(evalExpr(TL.ringRadiusExpr(), people)).toBeCloseTo(TL.ringRadius(people), 10);
    }
  });
});

describe("layer filters", () => {
  it("filters on the window and, only when asked, on type", () => {
    const w = TL.windowAt(100, 30);
    expect(TL.windowFilter(w)).toEqual(["all", [">=", ["get", "t"], 71], ["<=", ["get", "t"], 100]]);
    const typed = TL.windowFilter(w, new Set(["event"]));
    expect(typed[typed.length - 1]).toEqual(["in", ["get", "type"], ["literal", ["event"]]]);
  });
  it("has a filter that matches nothing for a layer that is switched off", () => {
    expect(TL.NOTHING).toEqual(["==", ["get", "t"], -1e9]);
  });
});

describe("base map choice", () => {
  it("needs a real key", () => {
    expect(TL.hasKey({ MAPTILER_KEY: "abc123" })).toBe(true);
    expect(TL.hasKey({ MAPTILER_KEY: "" })).toBe(false);
    expect(TL.hasKey({ MAPTILER_KEY: "REPLACE_WITH_KEY" })).toBe(false);
    expect(TL.hasKey({})).toBe(false);
    expect(TL.hasKey(undefined)).toBe(false);
  });
  it("builds the MapTiler style URL, light or noir, with the key encoded", () => {
    expect(TL.styleUrl({ MAPTILER_KEY: "abc123" }, "light")).toBe("https://api.maptiler.com/maps/dataviz/style.json?key=abc123");
    expect(TL.styleUrl({ MAPTILER_KEY: "abc123" }, "noir")).toBe("https://api.maptiler.com/maps/dataviz-dark/style.json?key=abc123");
    expect(TL.styleUrl({ MAPTILER_KEY: "a b&c" })).toContain("key=a%20b%26c");
    expect(TL.styleUrl({})).toBeNull();
  });
  it("has a plain style to fall back on that draws a ground and needs no network", () => {
    expect(TL.BLANK_STYLE.version).toBe(8);
    expect(TL.BLANK_STYLE.sources).toEqual({});
    expect(TL.BLANK_STYLE.layers[0]!.type).toBe("background");
  });
  it("treats only 401 and 403 as a refused key", () => {
    expect(TL.isKeyRefusal({ status: 403 })).toBe(true);
    expect(TL.isKeyRefusal({ status: 401 })).toBe(true);
    expect(TL.isKeyRefusal({ error: { status: 403 } })).toBe(true);
    expect(TL.isKeyRefusal({ status: 404 })).toBe(false);
    expect(TL.isKeyRefusal({ status: 500 })).toBe(false);
    expect(TL.isKeyRefusal(new Error("boom"))).toBe(false);
    expect(TL.isKeyRefusal(undefined)).toBe(false);
  });
});

describe("wiring that must stay true for the map to load", () => {
  const FILES = ["maplibre-gl.mjs", "maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs", "maplibre-gl.css"];
  it("vendors the SAME MapLibre bytes as Connect (bump both together; never an unpkg build)", () => {
    for (const f of FILES) {
      const here = readFileSync(join(root, "src/frontend/vendor/maplibre-gl", f));
      const connect = readFileSync(join(root, "../connect/src/frontend/vendor/maplibre-gl", f));
      expect(here.equals(connect), `${f} differs from Connect's copy`).toBe(true);
    }
  });
  it("loads the vendored module from the loader file", () => {
    const loader = read("src/frontend/maplibre-loader.mjs");
    expect(loader).toContain("./vendor/maplibre-gl/maplibre-gl.mjs");
    expect(loader).toContain("window.maplibregl");
    expect(loader).toContain("cv-maplibre-ready");
    expect(read("src/frontend/app/views.jsx")).toContain("cv-maplibre-ready");
  });
  it("registers timeline-lib.jsx in index.html AND appFileOrder, before views.jsx", () => {
    const html = read("src/frontend/index.html");
    expect(html).toContain('src="app/timeline-lib.jsx');
    expect(html.indexOf("app/timeline-lib.jsx")).toBeLessThan(html.indexOf("app/views.jsx"));
    const build = read("scripts/build-frontend.js");
    expect(build).toContain("'timeline-lib.jsx'");
    expect(build.indexOf("'timeline-lib.jsx'")).toBeLessThan(build.indexOf("'views.jsx'"));
  });
  it("is covered by the CSP as shipped: self-hosted script, workers and wasm, MapTiler tiles", () => {
    const cfg = read("next.config.ts");
    expect(cfg).toContain("worker-src 'self' blob:");
    expect(cfg).toContain("'wasm-unsafe-eval'");
    expect(cfg).toContain("https://api.maptiler.com");
    expect(cfg).not.toMatch(/script-src[^"]*'unsafe-inline'/);
  });
});
