/**
 * The Community Network Graph's pure helpers (src/frontend/app/network-lib.jsx →
 * window.CV_NETWORK), and the wiring that has to stay true: the file is
 * registered in index.html AND the build's appFileOrder before views.jsx.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd(); // apps/vision when run through its own vitest
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

interface Node { id: string; name: string; logo: string; shared: number; mine: number; theirs: number; pctMine: number | null; pctTheirs: number | null }
interface Placed { id: string; name: string; shared: number; x: number; y: number; r: number; strength: number }
interface Lib {
  MIN_SHARED: number;
  mapRows(rows: unknown[]): Node[];
  initials(name: string): string;
  clip(text: string, max: number): string;
  layout(nodes: Node[], box?: { width: number; height: number }): { center: { x: number; y: number; r: number }; nodes: Placed[]; edges: { id: string; w: number }[]; width: number; height: number };
  describe(node: Node, myName?: string): string;
  headline(nodes: Node[], days: number): string;
  fmtPct(p: number | null): string;
}

function loadLib(): Lib {
  const win: { CV_NETWORK?: Lib } = {};
  new Function("window", read("src/frontend/app/network-lib.jsx"))(win);
  if (!win.CV_NETWORK) throw new Error("network-lib.jsx did not publish window.CV_NETWORK");
  return win.CV_NETWORK;
}
const NW = loadLib();

const apiRow = (over: Record<string, unknown> = {}) => ({
  other_id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  other_name: "Grace Fellowship",
  other_logo_url: null,
  shared_count: 23,
  my_audience: 120,
  other_audience: 90,
  shared_pct_of_mine: "19.2",
  shared_pct_of_other: "25.6",
  period_start: "2026-07-17",
  period_end: "2026-10-14",
  ...over,
});

describe("mapRows", () => {
  it("turns reader rows (numeric as strings) into numbers", () => {
    const [n] = NW.mapRows([apiRow()]);
    expect(n).toMatchObject({ name: "Grace Fellowship", shared: 23, mine: 120, theirs: 90, pctMine: 19.2, pctTheirs: 25.6, logo: "" });
  });
  it("applies the privacy floor again: a pair under 3 shared citizens is never kept", () => {
    expect(NW.MIN_SHARED).toBe(3);
    expect(NW.mapRows([apiRow({ shared_count: 2 }), apiRow({ shared_count: 3, other_id: "a" })]).map((n) => n.shared)).toEqual([3]);
    expect(NW.mapRows([apiRow({ shared_count: 0 }), apiRow({ shared_count: null })])).toEqual([]);
  });
  it("drops rows with no organisation id and tolerates junk", () => {
    expect(NW.mapRows([apiRow({ other_id: null }), null as unknown as object, undefined as unknown as object])).toEqual([]);
    expect(NW.mapRows(null as unknown as unknown[])).toEqual([]);
  });
  it("never lets their audience be smaller than the people we share", () => {
    const [n] = NW.mapRows([apiRow({ shared_count: 9, other_audience: 4 })]);
    expect(n!.theirs).toBe(9);
  });
  it("sorts strongest first with the name as the tie-break, and keeps a null percent null", () => {
    const rows = NW.mapRows([
      apiRow({ other_id: "1", other_name: "B", shared_count: 5 }),
      apiRow({ other_id: "2", other_name: "A", shared_count: 5, shared_pct_of_mine: null }),
      apiRow({ other_id: "3", other_name: "C", shared_count: 8 }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(["C", "A", "B"]);
    expect(rows[1]!.pctMine).toBeNull();
  });
  it("falls back to a neutral name", () => {
    expect(NW.mapRows([apiRow({ other_name: "" })])[0]!.name).toBe("Organisation");
  });
});

describe("initials and clip", () => {
  it("makes one or two letters", () => {
    expect(NW.initials("Grace Fellowship")).toBe("GF");
    expect(NW.initials("hope")).toBe("HO");
    expect(NW.initials("")).toBe("?");
    expect(NW.initials("  ")).toBe("?");
  });
  it("shortens long labels with an ellipsis and leaves short ones alone", () => {
    expect(NW.clip("City Shelter Trust", 30)).toBe("City Shelter Trust");
    const cut = NW.clip("City Shelter Trust of Pretoria East", 12);
    expect(cut).toBe("City Shelte…");
    expect(cut.length).toBe(12); // never longer than the limit
  });
});

describe("layout", () => {
  const nodes = NW.mapRows([
    apiRow({ other_id: "a", other_name: "A", shared_count: 30, other_audience: 100 }),
    apiRow({ other_id: "b", other_name: "B", shared_count: 15, other_audience: 400 }),
    apiRow({ other_id: "c", other_name: "C", shared_count: 3, other_audience: 20 }),
  ]);
  const L = NW.layout(nodes, { width: 720, height: 460 });
  const dist = (p: Placed) => Math.hypot(p.x, p.y);

  it("puts your organisation in the middle and one node per organisation", () => {
    expect(L.center).toMatchObject({ x: 0, y: 0 });
    expect(L.nodes).toHaveLength(3);
    expect(L.edges).toHaveLength(3);
  });
  it("puts the strongest at the top and spreads the rest evenly clockwise", () => {
    const first = L.nodes[0]!;
    expect(first.x).toBeCloseTo(0, 5);
    expect(first.y).toBeLessThan(0);
    const angle = (p: Placed) => (Math.atan2(p.y, p.x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
    expect(angle(L.nodes[1]!)).toBeCloseTo((2 * Math.PI) / 3, 1);
    expect(angle(L.nodes[2]!)).toBeCloseTo((4 * Math.PI) / 3, 1);
  });
  it("makes more shared mean closer and thicker", () => {
    expect(dist(L.nodes[0]!)).toBeLessThan(dist(L.nodes[1]!));
    expect(dist(L.nodes[1]!)).toBeLessThan(dist(L.nodes[2]!));
    expect(L.edges[0]!.w).toBeGreaterThan(L.edges[1]!.w);
    expect(L.edges[1]!.w).toBeGreaterThan(L.edges[2]!.w);
  });
  it("sizes a node by the size of its own audience", () => {
    expect(L.nodes[1]!.r).toBeGreaterThan(L.nodes[0]!.r); // B has 400, A has 100
    expect(L.nodes[1]!.r).toBeCloseTo(28, 5); // the largest audience gets the biggest node
  });
  it("keeps every node and its label inside the box", () => {
    for (const p of L.nodes) {
      expect(Math.abs(p.x) + p.r).toBeLessThanOrEqual(360);
      expect(Math.abs(p.y) + p.r).toBeLessThanOrEqual(230);
    }
  });
  it("is deterministic and copes with nothing", () => {
    expect(NW.layout(nodes, { width: 720, height: 460 })).toEqual(L);
    expect(NW.layout([], { width: 720, height: 460 }).nodes).toEqual([]);
    expect(NW.layout(null as unknown as Node[]).nodes).toEqual([]);
  });
  it("handles a single organisation and equal strengths without dividing by zero", () => {
    const one = NW.layout(nodes.slice(0, 1));
    expect(Number.isFinite(one.nodes[0]!.x) && Number.isFinite(one.nodes[0]!.y)).toBe(true);
    const equal = NW.layout(NW.mapRows([apiRow({ other_id: "a", shared_count: 5 }), apiRow({ other_id: "b", other_name: "B", shared_count: 5 })]));
    expect(equal.nodes.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.strength === 1)).toBe(true);
  });
});

describe("the words", () => {
  const [g] = NW.mapRows([apiRow()]);
  it("puts the counts beside the percentages, both ways", () => {
    expect(NW.describe(g!, "Hope Collective")).toBe(
      "Hope Collective and Grace Fellowship share 23 community members. That is 23 of your 120 (19.2%). It is 23 of their 90 (25.6%)."
    );
  });
  it("says 'member' for one, and survives a missing audience or percent", () => {
    const text = NW.describe({ ...g!, shared: 1, mine: 0, theirs: 0, pctMine: null, pctTheirs: null }, undefined);
    expect(text).toBe("Your organisation and Grace Fellowship share 1 community member.");
  });
  it("has an honest headline for none, one and many", () => {
    expect(NW.headline([], 90)).toBe("No organisation shares 3 or more of your community members yet.");
    expect(NW.headline([g!], 90)).toBe("1 organisation shares community members with you over the last 90 days.");
    expect(NW.headline([g!, g!], 30)).toBe("2 organisations share community members with you over the last 30 days.");
  });
  it("formats a percent to one decimal, or a dash", () => {
    expect(NW.fmtPct(19.25)).toBe("19.3%");
    expect(NW.fmtPct(null)).toBe("—");
  });
});

describe("wiring that must stay true for the screen to load", () => {
  it("registers network-lib.jsx in index.html AND appFileOrder, before views.jsx", () => {
    const html = read("src/frontend/index.html");
    expect(html).toContain('src="app/network-lib.jsx');
    expect(html.indexOf("app/network-lib.jsx")).toBeLessThan(html.indexOf("app/views.jsx"));
    const build = read("scripts/build-frontend.js");
    expect(build).toContain("'network-lib.jsx'");
    expect(build.indexOf("'network-lib.jsx'")).toBeLessThan(build.indexOf("'views.jsx'"));
  });
  it("has the screen in the nav, the router and the views export", () => {
    expect(read("src/frontend/app/shell.jsx")).toContain('view: "network"');
    expect(read("src/frontend/app/app.jsx")).toContain("<S.Network");
    expect(read("src/frontend/app/views.jsx")).toMatch(/window\.Screens = Object\.assign\([\s\S]*\bNetwork\b/);
  });
});
