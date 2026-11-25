/**
 * Keyboard and screen-reader reach on the map (QA 2026-11-25, CCQA-0004; map-v2-pins.jsx chooseTabStops / applyTabStop).
 * 22 Tab presses on the desktop home reached 6 pins off the screen and 3 under a panel. Only pins a sighted person can
 * see may be Tab stops; the rest leave the Tab order and the screen reader's view. The layout half (what counts as
 * shown) is measured in map.jsx and proven by e2e/keyboard-focus.spec.ts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadFrontend } from "./support/loadFrontend";

type Entry = { id: string; shown: boolean; dist?: number; selected?: boolean; focused?: boolean };
type Pins = {
  MAX_TAB_STOPS: number;
  chooseTabStops: (e: Entry[], max?: number) => Set<string>;
  applyTabStop: (w: HTMLElement, on: boolean) => void;
};
let P: Pins;
beforeAll(() => {
  P = loadFrontend("map-v2-pins.jsx").MapV2Pins as Pins;
});

const many = (n: number, shown = true) => Array.from({ length: n }, (_, i) => ({ id: "p" + i, shown, dist: n - i }));

describe("chooseTabStops", () => {
  it("never offers a pin that is off the screen or covered", () => {
    const s = P.chooseTabStops([{ id: "a", shown: true, dist: 5 }, { id: "off", shown: false, dist: 1 }]);
    expect([...s]).toEqual(["a"]);
  });
  it("offers at most twelve, nearest the middle of the open map first", () => {
    const s = P.chooseTabStops(many(30));
    expect(P.MAX_TAB_STOPS).toBe(12);
    expect(s.size).toBe(12);
    // dist runs 30..1, so the twelve nearest are p18..p29
    expect([...s].sort()).toEqual(Array.from({ length: 12 }, (_, i) => "p" + (18 + i)).sort());
  });
  it("keeps the chosen pin when it is shown, even if far from the middle", () => {
    const e = many(20);
    e[0].selected = true; // the farthest one
    expect(P.chooseTabStops(e).has("p0")).toBe(true);
  });
  it("never strands focus: the focused pin stays a stop even when it has scrolled out of view", () => {
    const s = P.chooseTabStops([{ id: "gone", shown: false, focused: true }, ...many(3)]);
    expect(s.has("gone")).toBe(true);
  });
  it("offers nothing when nothing is shown (an empty or covered map)", () => {
    expect(P.chooseTabStops(many(5, false)).size).toBe(0);
    expect(P.chooseTabStops([]).size).toBe(0);
  });
});

describe("applyTabStop", () => {
  it("a stop is in the Tab order and heard; any other pin is neither", () => {
    const w = document.createElement("div");
    w.setAttribute("tabindex", "0");
    P.applyTabStop(w, false);
    expect(w.getAttribute("tabindex")).toBe("-1");
    expect(w.getAttribute("aria-hidden")).toBe("true");
    P.applyTabStop(w, true);
    expect(w.getAttribute("tabindex")).toBe("0");
    expect(w.hasAttribute("aria-hidden")).toBe(false);
  });
});
