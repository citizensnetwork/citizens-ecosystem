/**
 * Issue #210 part 2: the expanded listing sheet. The behaviour is covered end to end in
 * e2e/map-v2-listing-sheet.spec.ts (real touch); this file pins the contracts that are cheaper to read in the source:
 * the tab order, who opens the expanded sheet, the swipe rule, and the motion and token rules in the stylesheet.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const sheet = read("src/frontend/app/map-v2-sheet.jsx");
const home = read("src/frontend/app/home.jsx");
const css = read("src/frontend/assets/map-v2.css");

describe("the expanded listing sheet (#210)", () => {
  it("lists the tabs Events, News, Gallery in that order, then Today, each only with content", () => {
    const pushes = [...sheet.matchAll(/if \(([^)]*(?:\([^)]*\))?[^)]*)\) tabs\.push\(\{ id: '(\w+)'/g)].map((m) => m[2]);
    expect(pushes).toEqual(["events", "news", "gallery", "today"]);
    expect(sheet).toContain("if (posts.length) tabs.push");
    expect(sheet).toContain("if (images.length) tabs.push");
    expect(sheet).toContain("if (moments.length) tabs.push");
  });

  it("opens at full only when a card opened it; the clean map's pin keeps the half sheet", () => {
    expect(sheet).toContain("const opensAt = expanded ? 'full' : 'half';");
    expect(sheet).toContain("useState(opensAt)");
    expect(home).toContain("expanded: !clean, view: sheet.view");
  });

  it("closes an expanded sheet on a flick down or a release past a quarter of its height, never to half", () => {
    expect(sheet).toContain("const COLLAPSE_AT = 0.25;");
    expect(sheet).toMatch(/if \(expanded\) target = v >= FLICK \|\| \(v > -FLICK && y > m\.fullH \* COLLAPSE_AT\) \? 'close' : 'full';/);
  });

  it("leaves a swipe that starts on a sideways row to the row, and ignores the mouse", () => {
    expect(sheet).toContain("const ROW_SEL = \"[data-mv2='hrow'] [data-layout='row']\";");
    expect(sheet).toMatch(/onSwipeDown = \(e\) => \{\s*if \(e\.pointerType === 'mouse'/);
    expect(sheet).toContain("if (e.target.closest && e.target.closest(ROW_SEL)) return;");
    // the sheet's own vertical drag gives way once a press on the tab block moves sideways first
    expect(sheet).toContain("if (d.sideways && Math.abs(dx) >= DRAG_START_PX && Math.abs(dx) > Math.abs(dy))");
  });

  it("measures the distance with the Explore row's words, from where the map was looking at the tap", () => {
    expect(sheet).toContain("N.distanceText(meters, view.user ? words : words.centre)");
    expect(home).toContain("const view = from || (mapApi.current && mapApi.current.view ? mapApi.current.view() : null);");
    // a Nearby pick keeps the first measuring point
    expect(home).toContain("onPick: (id, t) => openSheet(id, t, sheet.view)");
  });

  it("slides a newly chosen panel in over the duration tokens only (so reduced motion shows it at once)", () => {
    expect(css).toMatch(/\[data-mv2='panel'\]\[data-enter='next'\] \{\s*animation: mv2-panel-next var\(--dur-base\)/);
    expect(css).toMatch(/\[data-mv2='panel'\]\[data-enter='prev'\] \{\s*animation: mv2-panel-prev var\(--dur-base\)/);
  });

  it("gives the header chip the card's group outline, and keeps the bar's controls at --hit", () => {
    expect(css).toMatch(/\[data-mv2='explore-card'\] \[data-mv2='card-chip'\],\s*\[data-mv2='xhead'\] \[data-mv2='card-chip'\] \{[^}]*border: 1px solid var\(--cat-c, var\(--divider\)\);/);
    expect(css).toMatch(/\[data-mv2='xbar'\] \{[^}]*grid-template-columns: var\(--hit\) 1fr var\(--hit\);[^}]*min-height: var\(--hit\);/);
  });
});
