/**
 * Map v2 pin rules (`src/frontend/app/map-v2-pins.jsx`, tracker P1-04): the pure
 * parts. The DOM builders are covered by the Playwright spec (e2e/map-v2.spec.ts);
 * what is pinned down here is the logic a rendering test would never catch:
 * which zoom shows a logo (D8), which label survives a collision, who heads an
 * overlap group, and that the glyph colour always reads on its fill.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFrontend } from "./support/loadFrontend";

type Item = { id: string; x: number; y: number; selected?: boolean; nextEventAt?: number; lastActivityAt?: number; title?: string };
type Label = Item & { w: number; h: number };
type Pins = {
  photoShown: (zoom: number, photoZoom: number, selected: boolean) => boolean;
  glyphColor: (hex: string) => string;
  ariaLabelFor: (m: { title?: string; isLive?: boolean }, category: string, strings: { listing: string; live: string }) => string;
  comparePriority: (a: Item, b: Item) => number;
  overlapGroups: (items: Item[], minDist: number) => { head: Item; count: number }[];
  hiddenLabels: (labels: Label[], pad: number) => string[];
};

let P: Pins;
let MAP_ZOOM: { PHOTO: number; GATES: Record<string, number>; LABELS: number };

beforeAll(() => {
  P = loadFrontend("map-v2-pins.jsx").MapV2Pins as Pins;
  MAP_ZOOM = loadFrontend("map.jsx").MAP_ZOOM as typeof MAP_ZOOM;
});

describe("which zoom shows the logo (D8)", () => {
  it("the photo zoom lives next to the other zoom rules in map.jsx and sits inside 13-15", () => {
    expect(MAP_ZOOM.PHOTO).toBeGreaterThanOrEqual(13);
    expect(MAP_ZOOM.PHOTO).toBeLessThanOrEqual(15);
  });

  it("below the photo zoom a pin is a glyph pin, at and above it a logo pin", () => {
    expect(P.photoShown(14.99, 15, false)).toBe(false);
    expect(P.photoShown(15, 15, false)).toBe(true);
    expect(P.photoShown(17, 15, false)).toBe(true);
  });

  it("the selected pin always shows its logo, at any zoom", () => {
    expect(P.photoShown(6, 15, true)).toBe(true);
  });
});

describe("glyph colour on a category fill", () => {
  const hexes = [...new Set([...readFileSync(join(process.cwd(), "src/frontend/app/data.jsx"), "utf8").matchAll(/hex: '(#[0-9A-Fa-f]{6})'/g)].map((m) => m[1]))];

  it("picks white on a dark fill and near-black on a light one", () => {
    expect(P.glyphColor("#212121")).toBe("#FFFFFF");
    expect(P.glyphColor("#D4AF37")).toBe("#0A0908"); // gold: white would be 2.1:1
    expect(P.glyphColor("#2ECC71")).toBe("#0A0908");
  });

  it("reads at 4.5:1 or better on every one of the 23 category colours", () => {
    expect(hexes.length).toBe(23);
    const lum = (hex: string) => {
      const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    for (const h of hexes) {
      const g = P.glyphColor(h);
      const [a, b] = [lum(g), lum(h)];
      const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      expect(r, `${h} with ${g}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("the pin's accessible name", () => {
  it("is '{name}, {category}', with 'live now' for a live event", () => {
    const S = loadFrontend("map-v2-strings.jsx").MapV2Strings as { pin: { listing: string; live: string } };
    expect(P.ariaLabelFor({ title: "Anchor Church" }, "Churches", S.pin)).toBe("Anchor Church, Churches");
    expect(P.ariaLabelFor({ title: "Sunday Celebration", isLive: true }, "Church Services", S.pin)).toBe("Sunday Celebration, Church Services, live now");
    expect(P.ariaLabelFor({}, "", S.pin)).toBe("Listing");
  });
});

describe("priority: upcoming event, then recent activity, never popularity", () => {
  const at = (id: string, extra: Partial<Item> = {}): Item => ({ id, x: 0, y: 0, title: id, ...extra });

  it("selected first; then an upcoming event (soonest first); then the most recent activity; then the name", () => {
    const list = [
      at("quiet-b"),
      at("active", { lastActivityAt: 2000 }),
      at("soon", { nextEventAt: 100 }),
      at("later", { nextEventAt: 900 }),
      at("quiet-a"),
      at("selected", { selected: true }),
    ];
    expect(list.sort(P.comparePriority).map((i) => i.id)).toEqual(["selected", "soon", "later", "active", "quiet-a", "quiet-b"]);
  });
});

describe("overlap badges (+N)", () => {
  it("no group when pins are apart", () => {
    expect(P.overlapGroups([{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 100 }], 28)).toEqual([]);
  });

  it("two pins within the distance form one group headed by the higher-priority pin", () => {
    const g = P.overlapGroups([{ id: "a", x: 10, y: 10, title: "a" }, { id: "b", x: 20, y: 12, title: "b", nextEventAt: 5 }], 28);
    expect(g).toHaveLength(1);
    expect(g[0].count).toBe(2);
    expect(g[0].head.id).toBe("b"); // it has an upcoming event
  });

  it("is single-link: a chain a-b-c counts as one group of three, a far pin stays out", () => {
    const g = P.overlapGroups([
      { id: "a", x: 0, y: 0, title: "a" }, { id: "b", x: 25, y: 0, title: "b" }, { id: "c", x: 50, y: 0, title: "c" }, { id: "far", x: 400, y: 400, title: "far" },
    ], 28);
    expect(g).toHaveLength(1);
    expect(g[0].count).toBe(3);
  });
});

describe("label collisions", () => {
  const lab = (id: string, x: number, extra: Partial<Label> = {}): Label => ({ id, x, y: 0, w: 60, h: 14, title: id, ...extra });

  it("keeps non-overlapping labels", () => {
    expect(P.hiddenLabels([lab("a", 0), lab("b", 100)], 2)).toEqual([]);
  });

  it("hides the lower-priority label of an overlapping pair", () => {
    expect(P.hiddenLabels([lab("a", 0), lab("b", 30, { nextEventAt: 1 })], 2)).toEqual(["a"]);
  });

  it("never hides the selected pin's label", () => {
    expect(P.hiddenLabels([lab("a", 0, { nextEventAt: 1 }), lab("sel", 30, { selected: true })], 2)).toEqual(["a"]);
    expect(P.hiddenLabels([lab("sel", 0, { selected: true }), lab("b", 30, { nextEventAt: 1 })], 2)).toEqual(["b"]);
  });
});
