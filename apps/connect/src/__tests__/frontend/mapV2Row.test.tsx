/**
 * Map v2 sideways row (`src/frontend/app/map-v2-row.jsx`): the News tab and Nearby are one row of cards that
 * scrolls sideways, capped, with "See all" to open the whole list in place.
 *
 * jsdom has no layout, so the widths the row reads (clientWidth, scrollWidth, a card's offsetLeft) are stood in
 * for here. What this pins down: the cap, See all and Show fewer, the arrows (a mouse only, only while the row
 * overflows, aria-disabled at the ends), the smooth glide unless reduced motion, and the stylesheet contract
 * (tokens, the touch rule, no CSS scroll-behavior). Real scrolling, snap and touch are in
 * e2e/map-v2-sideways-rows.spec.ts.
 */
import React from "react";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Strings = { label: string; count: (s: number, t: number) => string; all: (t: number) => string; seeAll: (t: number) => string; showFewer: string };
type RowProps = {
  items: { id: string; title: string }[];
  render: (item: { id: string; title: string }, i: number) => React.ReactNode;
  keyOf: (item: { id: string }) => string;
  strings: Strings;
  idPrefix?: string;
  max?: number;
};
type Api = {
  ROW_MAX: number;
  visibleItems: (items: unknown, max: number, expanded: boolean) => unknown[];
  edgesOf: (left: number, client: number, scroll: number) => { scrollable: boolean; start: boolean; end: boolean };
  pageStep: (cardStep: number, view: number) => number;
  focusShift: (rowLeft: number, rowRight: number, cardLeft: number, cardRight: number, gutter: number) => number;
  Row: React.ComponentType<RowProps>;
};

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

let api: Api;
let S: { sheet: { news: { row: Strings }; nearby: { row: { label: string } }; row: { prev: string; next: string } } };

// What the stand-in layout says: a 343 px row holding cards 272 px apart.
const layout = { client: 343, scroll: 343, scrollLeft: 0, step: 272 };
let fine = true;
let reduced = false;
const scrollBy = vi.fn();

beforeAll(() => {
  const w = window as unknown as Record<string, unknown>;
  function Icon({ name }: { name: string }) {
    return React.createElement("svg", { "data-icon": name });
  }
  w.Icon = Icon;
  new Function("window", "React", "document", read("src/frontend/app/map-v2-strings.jsx"))(window, React, document);
  new Function("window", "React", "document", read("src/frontend/app/map-v2-row.jsx"))(window, React, document);
  api = (window as unknown as { MapV2Row: Api }).MapV2Row;
  S = (window as unknown as { MapV2Strings: typeof S }).MapV2Strings;

  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => layout.client });
  Object.defineProperty(proto, "scrollWidth", { configurable: true, get: () => layout.scroll });
  Object.defineProperty(proto, "scrollLeft", { configurable: true, get: () => layout.scrollLeft, set: (v: number) => { layout.scrollLeft = v; } });
  Object.defineProperty(proto, "offsetLeft", {
    configurable: true,
    get(this: HTMLElement) { return this.parentElement ? Array.prototype.indexOf.call(this.parentElement.children, this) * layout.step : 0; },
  });
  proto.scrollBy = scrollBy;
});

beforeEach(() => {
  layout.client = 343; layout.scroll = 343; layout.scrollLeft = 0;
  fine = true; reduced = false;
  scrollBy.mockClear();
  (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: query.includes("pointer: fine") ? fine : query.includes("prefers-reduced-motion") ? reduced : false,
    addEventListener() {},
    removeEventListener() {},
  });
});
afterEach(() => cleanup());

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "p" + (i + 1), title: "Post " + (i + 1) }));

function mount(n: number, over: Partial<RowProps> = {}) {
  return render(React.createElement(api.Row, {
    items: items(n),
    keyOf: (it) => it.id,
    render: (it) => React.createElement("button", { type: "button", "data-testid": "card" }, it.title),
    strings: S.sheet.news.row,
    idPrefix: "t-row",
    ...over,
  }));
}

describe("visibleItems", () => {
  it("keeps the first ten, in the caller's order, and everything once expanded", () => {
    const all = items(14);
    expect(api.ROW_MAX).toBe(10);
    expect((api.visibleItems(all, 10, false) as { id: string }[]).map((x) => x.id)).toEqual(all.slice(0, 10).map((x) => x.id));
    expect(api.visibleItems(all, 10, true)).toHaveLength(14);
  });

  it("shows a short list whole, uses ten for a missing or silly cap, and survives a non-list", () => {
    expect(api.visibleItems(items(3), 10, false)).toHaveLength(3);
    expect(api.visibleItems(items(12), undefined as unknown as number, false)).toHaveLength(10);
    expect(api.visibleItems(items(12), 0, false)).toHaveLength(10);
    expect(api.visibleItems(items(12), NaN, false)).toHaveLength(10);
    expect(api.visibleItems(items(30), 4.9, false)).toHaveLength(4);
    expect(api.visibleItems(items(30), Infinity, false)).toHaveLength(30);
    expect(api.visibleItems(null, 10, false)).toEqual([]);
  });
});

describe("edgesOf", () => {
  it("a row that fits is not scrollable and is at both ends", () => {
    expect(api.edgesOf(0, 343, 343)).toEqual({ scrollable: false, start: true, end: true });
    expect(api.edgesOf(0, 343, 343.8)).toEqual({ scrollable: false, start: true, end: true });
  });

  it("knows the start, the middle and the end, with a pixel of slack for sub-pixel offsets", () => {
    expect(api.edgesOf(0, 343, 1200)).toEqual({ scrollable: true, start: true, end: false });
    expect(api.edgesOf(272, 343, 1200)).toEqual({ scrollable: true, start: false, end: false });
    expect(api.edgesOf(856.6, 343, 1200)).toEqual({ scrollable: true, start: false, end: true });
    expect(api.edgesOf(0.4, 343, 1200).start).toBe(true);
    expect(api.edgesOf(-856, 343, 1200).end).toBe(true);
  });
});

describe("pageStep", () => {
  it("moves one card on a phone and two on a tablet, and never fewer than one", () => {
    expect(api.pageStep(272, 343)).toBe(272);
    expect(api.pageStep(272, 608)).toBe(544);
    expect(api.pageStep(272, 100)).toBe(272);
  });

  it("falls back to the row's width when the card spacing is unknown", () => {
    expect(api.pageStep(0, 343)).toBe(343);
    expect(api.pageStep(NaN, 343)).toBe(343);
  });
});

describe("focusShift", () => {
  it("leaves a card that is whole in view where it is", () => {
    expect(api.focusShift(0, 375, 16, 280, 16)).toBe(0);
    expect(api.focusShift(268, 648, 284, 548, 16)).toBe(0);
  });

  it("puts the start of a card that only shows its edge on the gutter, from either side", () => {
    expect(api.focusShift(268, 648, 556, 820, 16)).toBe(272);          // the second card, peeking on the right
    expect(api.focusShift(0, 375, -250, 14, 16)).toBe(-266);           // a card cut off on the left
  });

  it("copes with a missing gutter", () => {
    expect(api.focusShift(0, 375, 300, 564, NaN)).toBe(300);
  });
});

describe("keyboard focus on a card that is mostly cut off", () => {
  const spy = vi.spyOn(Element.prototype, "matches");
  const realMatches = Element.prototype.matches;
  const realRect = HTMLElement.prototype.getBoundingClientRect;
  let keyboard = true;

  beforeEach(() => {
    keyboard = true;
    spy.mockImplementation(function (this: Element, sel: string) {
      return sel === ":focus-visible" ? keyboard : realMatches.call(this, sel);
    });
    // 375 px row, cards 264 wide 272 apart, the first on the 16 px gutter
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.tagName === "UL") return { left: 0, right: 375, top: 0, bottom: 300, width: 375, height: 300, x: 0, y: 0, toJSON() {} } as DOMRect;
      const i = this.parentElement ? Array.prototype.indexOf.call(this.parentElement.children, this) : 0;
      const left = 16 + i * 272 - layout.scrollLeft;
      return { left, right: left + 264, top: 0, bottom: 300, width: 264, height: 300, x: left, y: 0, toJSON() {} } as DOMRect;
    };
    layout.scroll = 1200;
  });
  afterEach(() => {
    spy.mockReset();
    HTMLElement.prototype.getBoundingClientRect = realRect;
  });

  function focusCard(n: number) {
    const { container } = mount(6);
    container.querySelector("ul")!.style.paddingLeft = "16px";
    const card = screen.getAllByTestId("card")[n];
    act(() => card.focus());
  }

  it("Tab to the second card brings it whole into view", () => {
    focusCard(1);
    expect(layout.scrollLeft).toBe(272);
  });

  it("a card already whole is left alone", () => {
    focusCard(0);
    expect(layout.scrollLeft).toBe(0);
  });

  it("a click or a tap on a peeking card does not move the row under the finger", () => {
    keyboard = false;
    focusCard(1);
    expect(layout.scrollLeft).toBe(0);
  });
});

describe("the row", () => {
  it("is a named region holding a list of the cards, in order, with no header when nothing is hidden and nothing to press", () => {
    fine = false;
    const { container } = mount(4);
    const region = screen.getByRole("region", { name: "Latest news" });
    expect(region.getAttribute("data-mv2")).toBe("hrow");
    const list = region.querySelector("ul")!;
    expect(list.getAttribute("role")).toBe("list");
    expect(list.getAttribute("data-layout")).toBe("row");
    expect(screen.getAllByTestId("card").map((c) => c.textContent)).toEqual(["Post 1", "Post 2", "Post 3", "Post 4"]);
    expect(container.querySelectorAll("li[data-mv2='hrow-item']")).toHaveLength(4);
    expect(container.querySelector("[data-mv2='hrow-head']")).toBeNull();
    expect(screen.queryByRole("button", { name: /see all/i })).toBeNull();
  });

  it("draws the newest ten and says so, with See all, when there are more", () => {
    const { container } = mount(13);
    expect(screen.getAllByTestId("card")).toHaveLength(10);
    expect(screen.getAllByTestId("card")[9].textContent).toBe("Post 10");
    expect(container.querySelector("[data-mv2='hrow-count']")!.textContent).toBe("Newest 10 of 13");
    const all = screen.getByRole("button", { name: "See all 13" });
    expect(all.getAttribute("aria-expanded")).toBe("false");
    expect(all.getAttribute("aria-controls")).toBe("t-row-list");
    expect(container.querySelector("ul")!.id).toBe("t-row-list");
  });

  it("See all opens the whole list in place, Show fewer puts the row back, and the toggle keeps focus", () => {
    const { container } = mount(13);
    const list = container.querySelector("ul")!;
    const all = screen.getByRole("button", { name: "See all 13" });
    all.focus();
    fireEvent.click(all);
    expect(container.querySelector("ul")).toBe(list);
    expect(list.getAttribute("data-layout")).toBe("stack");
    expect(screen.getAllByTestId("card")).toHaveLength(13);
    expect(container.querySelector("[data-mv2='hrow-count']")!.textContent).toBe("All 13 posts");
    const fewer = screen.getByRole("button", { name: "Show fewer" });
    expect(fewer.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(fewer);
    fireEvent.click(fewer);
    expect(list.getAttribute("data-layout")).toBe("row");
    expect(screen.getAllByTestId("card")).toHaveLength(10);
    expect(screen.getByRole("button", { name: "See all 13" })).toBeTruthy();
  });

  it("goes back to the first card when it returns to a row", () => {
    const { container } = mount(13);
    layout.scrollLeft = 544;
    fireEvent.click(screen.getByRole("button", { name: "See all 13" }));
    layout.scrollLeft = 300;
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(container.querySelector("ul")!.scrollLeft).toBe(0);
  });

  it("Nearby's row has a name of its own and never offers See all (it holds eight at most)", () => {
    fine = false;
    mount(8, { strings: S.sheet.nearby.row as unknown as Strings });
    expect(screen.getByRole("region", { name: "Nearby listings, closest first" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /see all/i })).toBeNull();
  });

  it("a list with no See all words is never cut, even past ten", () => {
    fine = false;
    mount(13, { strings: S.sheet.nearby.row as unknown as Strings });
    expect(screen.getAllByTestId("card")).toHaveLength(13);
    expect(screen.queryByRole("button", { name: /see all/i })).toBeNull();
  });

  it("closes itself when the list shrinks back under the cap while it was open", () => {
    const { rerender, container } = mount(13);
    fireEvent.click(screen.getByRole("button", { name: "See all 13" }));
    expect(container.querySelector("ul")!.getAttribute("data-layout")).toBe("stack");
    const props = { items: items(8), keyOf: (it: { id: string }) => it.id, render: (it: { title: string }) => React.createElement("button", { type: "button", "data-testid": "card" }, it.title), strings: S.sheet.news.row, idPrefix: "t-row" };
    rerender(React.createElement(api.Row, props as unknown as RowProps));
    expect(container.querySelector("ul")!.getAttribute("data-layout")).toBe("row");
    rerender(React.createElement(api.Row, { ...props, items: items(13) } as unknown as RowProps));
    expect(container.querySelector("ul")!.getAttribute("data-layout")).toBe("row");
    expect(screen.getByRole("button", { name: "See all 13" })).toBeTruthy();
  });
});

describe("the arrows (a mouse only)", () => {
  beforeEach(() => { layout.scroll = 1200; });

  it("show on a fine pointer while the row overflows: Previous is dimmed at the start but stays focusable", () => {
    mount(6);
    const prev = screen.getByRole("button", { name: "Previous" });
    const next = screen.getByRole("button", { name: "Next" });
    expect(prev.getAttribute("aria-disabled")).toBe("true");
    expect(prev.hasAttribute("disabled")).toBe(false);
    expect(next.getAttribute("aria-disabled")).toBeNull();
    prev.focus();
    expect(document.activeElement).toBe(prev);
    fireEvent.click(prev);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("Next moves one whole card on a phone, smoothly", () => {
    mount(6);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith({ left: 272, behavior: "smooth" });
  });

  it("do not glide for a person who asked for reduced motion", () => {
    reduced = true;
    mount(6);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(scrollBy).toHaveBeenCalledWith({ left: 272, behavior: "auto" });
  });

  it("follow the scroll position: at the end Next is dimmed and Previous is live", () => {
    const { container } = mount(6);
    layout.scrollLeft = 857;
    act(() => { container.querySelector("ul")!.dispatchEvent(new Event("scroll")); });
    expect(screen.getByRole("button", { name: "Next" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: "Previous" }).getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(scrollBy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(scrollBy).toHaveBeenCalledWith({ left: -272, behavior: "smooth" });
  });

  it("are not drawn for a finger, for a row that fits, or while the whole list is open", () => {
    fine = false;
    const first = mount(6);
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    first.unmount();

    fine = true; layout.scroll = 343;
    const second = mount(2);
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    second.unmount();

    layout.scroll = 1200;
    mount(13);
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "See all 13" }));
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Previous" })).toBeNull();
  });
});

describe("the stylesheet and the wiring", () => {
  const css = read("src/frontend/assets/map-v2.css");
  const section = css.slice(css.indexOf("/* ── 4i. Sideways rows"), css.indexOf("/* ── 4e. Hover and pressed"));
  const decls = (src: string, name: string) => [...src.matchAll(new RegExp(`(?<![\\w-])${name}:\\s*([^;]+);`, "g"))].map((m) => m[1].trim());

  it("takes the card width, the peek and the dimmed look from tokens", () => {
    expect(css).toMatch(/:root\s*\{[\s\S]*?--hrow-card-w:\s*264px;[\s\S]*?--hrow-peek:\s*48px;[\s\S]*?--disabled-opacity:\s*0\.4;/);
    expect(section.length).toBeGreaterThan(500);
    expect(section).toContain("width: min(var(--hrow-card-w), calc(100% - var(--hrow-peek)));");
    expect(section).toContain("opacity: var(--disabled-opacity);");
    expect(section).not.toMatch(/--hrow-card-w:|--hrow-peek:|--disabled-opacity:/);
  });

  it("snaps to the start of a card, keeps the gutter clear, and never lets a sideways flick leave the row", () => {
    expect(section).toContain("scroll-snap-type: x mandatory;");
    expect(section).toContain("scroll-snap-align: start;");
    expect(section).toContain("scroll-padding-inline: var(--space-4);");
    expect(section).toContain("overscroll-behavior-x: contain;");
    expect(section).toContain("align-items: stretch;");
    expect(section).toContain("[data-mv2='hrow-item']:only-child");
  });

  it("leaves the glide to the script: no CSS scroll-behavior anywhere in Map v2", () => {
    expect(css).not.toMatch(/(?<![\w-])scroll-behavior\s*:/);
  });

  it("gives the row its own touch rule: the sheet's value plus pan-x, in every state", () => {
    expect(css).toMatch(/\[data-mv2='scroller'\] \[data-mv2='hrow'\] \[data-layout='row'\] \*\s*\{\s*touch-action: var\(--mv2-ta-row, pan-x\);/);
    const sheetTa = decls(css, "--mv2-ta");
    const rowTa = decls(css, "--mv2-ta-row");
    expect(sheetTa.length).toBeGreaterThanOrEqual(4);
    expect(rowTa).toEqual(sheetTa.map((v) => "pan-x " + v));
  });

  it("is registered before Nearby, after the card, in the page and in the build, with the new version", () => {
    const html = read("src/frontend/index.html");
    const build = read("scripts/build-frontend.js");
    expect(html).toContain('src="app/map-v2-row.jsx?v=20261025b"');
    expect(html.indexOf("app/map-v2-card.jsx")).toBeLessThan(html.indexOf("app/map-v2-row.jsx"));
    expect(html.indexOf("app/map-v2-row.jsx")).toBeLessThan(html.indexOf("app/map-v2-nearby.jsx"));
    expect(build.indexOf("'map-v2-card.jsx'")).toBeLessThan(build.indexOf("'map-v2-row.jsx'"));
    expect(build.indexOf("'map-v2-row.jsx'")).toBeLessThan(build.indexOf("'map-v2-nearby.jsx'"));
  });

  it("is what the News tab and Nearby draw, and the sheet restarts each at the first card for a new listing", () => {
    const sheet = read("src/frontend/app/map-v2-sheet.jsx");
    expect(sheet).toContain("h(window.MapV2Row.Row, {");
    expect(sheet).toContain("key: 'news:' + id");
    expect(sheet).toContain("h(N.List, { key: type + ':' + id,");
    expect(read("src/frontend/app/map-v2-nearby.jsx")).toContain("h(Row.Row, {");
  });
});
