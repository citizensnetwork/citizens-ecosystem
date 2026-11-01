/**
 * Map v2 navigation refresh (issue #210): the category groups and pills, the Explore row
 * (`src/frontend/app/map-v2-explore.jsx`) and the folding nav (`src/frontend/app/map-v2-nav.jsx`). The Explore panel also
 * holds the category list and the lowering handle (founder, 2026-10-30).
 *
 * jsdom has no layout, so what is pinned here is the logic and the markup: every category belongs to one group,
 * the pills' tests, the row's order and cap (the selected listing always kept), the gold outline and its words,
 * card and See all taps, the folding nav's items, targets, inactivity fold, Escape and the unread dot, and the
 * stylesheet and wiring contract. Real touch, scrolling and the map are in e2e/map-v2-nav-explore.spec.ts.
 */
import React from "react";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Marker = { id: string; type: string; title: string; category?: string; lat?: number; lng?: number; kind?: string };
type Ranked = { m: Marker; meters: number };
type ExploreApi = {
  ROW_CAP: number;
  GROUPS: string[];
  GROUP_OF: Record<string, string>;
  PILLS: { id: string; group?: boolean; icon?: string }[];
  groupOf: (m: unknown) => string;
  pillMatches: (pill: string, m: unknown) => boolean;
  rank: (origin: { lat: number; lng: number } | null, markers: Marker[], selectedId: string | null, cap?: number) => Ranked[];
  Pills: React.ComponentType<{ value: string; onChange: (id: string) => void; ideas: boolean; onIdeas: () => void }>;
  Categories: React.ComponentType<{ value: string; ideas: boolean; onPick: (id: string) => void; onIdeas: () => void }>;
  Explore: React.ComponentType<Record<string, unknown>>;
};
type NavLib = {
  IDLE_MS: number;
  ITEMS: { id: string; icon: string }[];
  currentOf: (nav: unknown) => string;
  targetOf: (id: string) => [string, Record<string, unknown>] | null;
};

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const load = (file: string) => new Function("window", "React", "document", read("src/frontend/app/" + file))(window, React, document);

let X: ExploreApi;
let N: NavLib;
let S: { explore: Record<string, unknown> & { groups: Record<string, string> }; nav: Record<string, unknown> & { items: Record<string, string> } };
const scrollTo = vi.fn();

// Pretoria-ish: one degree of latitude is about 111 km.
const ORIGIN = { lat: -25.75, lng: 28.19 };
const at = (km: number) => ({ lat: ORIGIN.lat + km / 111.2, lng: ORIGIN.lng });
const mk = (id: string, km: number, extra: Partial<Marker> = {}): Marker => ({ id, type: "contributor", title: "Listing " + id, category: "churches-ministries", ...at(km), ...extra });

beforeAll(() => {
  const w = window as unknown as Record<string, unknown>;
  w.Icon = function Icon({ name }: { name: string }) {
    return React.createElement("svg", { "data-icon": name });
  };
  w.UI = { safeUrl: (u: string) => (typeof u === "string" && u.startsWith("https://") ? u : "") };
  ["data.jsx", "map-v2-strings.jsx", "map-v2-card.jsx", "map-v2-row.jsx", "map-v2-nearby.jsx", "map-v2-explore.jsx", "map-v2-nav.jsx"].forEach(load);
  X = w.MapV2Explore as ExploreApi;
  N = w.MapV2NavLib as NavLib;
  S = w.MapV2Strings as typeof S;
  (HTMLElement.prototype as unknown as { scrollTo: unknown }).scrollTo = scrollTo;
});
afterEach(() => {
  cleanup();
  scrollTo.mockClear();
  vi.useRealTimers();
});

describe("category groups (one muted colour per group, founder 2026-10-26)", () => {
  it("puts every event category, place category and Contributor type in exactly one known group", () => {
    const D = (window as unknown as { DATA: Record<string, { id: string }[]> }).DATA;
    const ids = [...new Set([...D.EVENT_CATEGORIES, ...D.PLACE_CATEGORIES, ...D.CONTRIBUTOR_TYPES].map((c) => c.id))];
    expect(ids.length).toBe(30);
    for (const id of ids) expect(X.GROUPS, id).toContain(X.GROUP_OF[id]);
    expect(Object.keys(X.GROUP_OF).sort()).toEqual([...ids].sort());
  });

  it("knows no group for an unknown or missing category (and never reads the prototype)", () => {
    expect(X.groupOf({ category: "nope" })).toBe("");
    expect(X.groupOf({ category: "constructor" })).toBe("");
    expect(X.groupOf(null)).toBe("");
    expect(X.groupOf({ category: "kids" })).toBe("audiences");
  });

  it("filters by pill: All passes all, Events is a type, the rest are groups", () => {
    const church = mk("a", 1);
    const event = mk("b", 1, { type: "event", category: "markets-expos" });
    expect(X.pillMatches("all", church)).toBe(true);
    expect(X.pillMatches("", church)).toBe(true);
    expect(X.pillMatches("events", event)).toBe(true);
    expect(X.pillMatches("events", church)).toBe(false);
    expect(X.pillMatches("worship", church)).toBe(true);
    expect(X.pillMatches("culture", event)).toBe(true);
    expect(X.pillMatches("business", church)).toBe(false);
  });

  it("has one short pill row in the agreed order, with words for each and for Ideas", () => {
    expect(X.PILLS.map((p) => p.id)).toEqual(["all", "worship", "events", "business", "serve", "culture", "learn", "audiences"]);
    for (const id of [...X.PILLS.map((p) => p.id), "ideas"]) expect(S.explore.groups[id], id).toBeTruthy();
  });
});

describe("the Explore row's order", () => {
  it("is nearest first, ideas and listings without a position left out", () => {
    const rows = X.rank(ORIGIN, [mk("far", 9), mk("near", 1), mk("idea", 0.1, { type: "idea" }), { id: "nowhere", type: "place", title: "Nowhere" }, mk("mid", 4)], null);
    expect(rows.map((r) => r.m.id)).toEqual(["near", "mid", "far"]);
    expect(rows[0].meters).toBeGreaterThan(900);
    expect(rows[0].meters).toBeLessThan(1100);
  });

  it("is capped, and adds the selected listing at the end when it is further than the cap (nothing else moves)", () => {
    const many = Array.from({ length: 30 }, (_, i) => mk("n" + i, i + 1));
    expect(X.rank(ORIGIN, many, null).length).toBe(X.ROW_CAP);
    const rows = X.rank(ORIGIN, many, "n29", 5);
    expect(rows.map((r) => r.m.id)).toEqual(["n0", "n1", "n2", "n3", "n4", "n29"]);
  });

  it("falls back to name order when there is no origin yet", () => {
    const rows = X.rank(null, [mk("b", 1, { title: "Beta" }), mk("a", 2, { title: "Alpha" })], null);
    expect(rows.map((r) => r.m.title)).toEqual(["Alpha", "Beta"]);
  });
});

describe("Pills", () => {
  it("are one labelled group of buttons, the chosen one pressed, each group pill with its colour dot", () => {
    const onChange = vi.fn();
    const onIdeas = vi.fn();
    render(React.createElement(X.Pills, { value: "worship", onChange, ideas: false, onIdeas }));
    const group = screen.getByRole("group", { name: S.explore.pillsLabel as string });
    expect(group).toBeTruthy();
    const worship = screen.getByRole("button", { name: S.explore.groups.worship });
    expect(worship.getAttribute("aria-pressed")).toBe("true");
    expect(worship.querySelector("[data-cat='worship']")).toBeTruthy();
    expect(screen.getByRole("button", { name: S.explore.groups.all }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: S.explore.groups.events }));
    expect(onChange).toHaveBeenCalledWith("events");
    fireEvent.click(screen.getByRole("button", { name: S.explore.groups.ideas }));
    expect(onIdeas).toHaveBeenCalled();
  });
});

describe("Explore", () => {
  const view = { centre: ORIGIN, user: null as null | { lat: number; lng: number } };
  const apiRef = { current: { view: () => view, onView: () => () => {} } };
  const markers = [mk("one", 1, { title: "First church" }), mk("two", 3, { title: "Second café", category: "hospitality-cafes", type: "place" }), mk("three", 6, { title: "Third", type: "event", category: "kids" })];
  const sources = { contributors: [{ id: "one", coverPhoto: "https://img.test/one.jpg" }], places: [], events: [] };

  it("titles the row Explore with See all, and draws large image cards nearest first with km", () => {
    const onSeeAll = vi.fn();
    render(React.createElement(X.Explore, { markers, sources, apiRef, selectedId: null, onOpen: vi.fn(), onSeeAll }));
    expect(screen.getByRole("heading", { name: S.explore.title as string })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: S.explore.seeAllLabel as string }));
    expect(onSeeAll).toHaveBeenCalled();
    const cards = document.querySelectorAll("[data-mv2='explore-card']");
    expect([...cards].map((c) => c.getAttribute("data-explore-id"))).toEqual(["one", "two", "three"]);
    expect(cards[0].textContent).toContain("1 km from the map centre");
    expect(cards[0].querySelector("img")!.getAttribute("src")).toBe("https://img.test/one.jpg");
    // no picture: a neutral tile with the category icon, so the row keeps one shape
    expect(cards[1].querySelector("[data-tile]")).toBeTruthy();
    // the group colour rides on the card and its dot
    expect(cards[1].querySelector("[data-mv2='card2']")!.getAttribute("data-cat")).toBe("business");
    expect(cards[2].querySelector("[data-mv2='card-dot']")!.getAttribute("data-cat")).toBe("audiences");
  });

  it("says 'away' once the person's position is known, and names the region by it", () => {
    view.user = ORIGIN;
    render(React.createElement(X.Explore, { markers, sources, apiRef, selectedId: null, onOpen: vi.fn(), onSeeAll: vi.fn() }));
    expect(screen.getByRole("region", { name: S.explore.label as string })).toBeTruthy();
    expect(document.querySelector("[data-explore-id='one']")!.textContent).toContain("1 km away");
    view.user = null;
  });

  it("outlines the chosen card, says what the next tap does, announces it, and a card tap reports that listing", () => {
    const onOpen = vi.fn();
    render(React.createElement(X.Explore, { markers, sources, apiRef, selectedId: "two", onOpen, onSeeAll: vi.fn() }));
    const sel = document.querySelector("[data-explore-id='two']")!;
    expect(sel.hasAttribute("data-selected")).toBe(true);
    expect(document.querySelectorAll("[data-selected]").length).toBe(1);
    expect(sel.querySelector("[data-mv2='explore-badge']")!.textContent).toBe("Tap again to open");
    expect(sel.querySelector("[aria-current='true']")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Second café is chosen. Press it again to open it.");
    fireEvent.click(sel.querySelector("button")!);
    expect(onOpen).toHaveBeenCalledWith("two", "place");
  });

  it("scrolls the row to a card only for a PIN tap (a card tap leaves the row exactly where it is)", () => {
    const { rerender } = render(React.createElement(X.Explore, { markers, sources, apiRef, selectedId: null, onOpen: vi.fn(), onSeeAll: vi.fn() }));
    scrollTo.mockClear();
    // a card was tapped: it is chosen, and nothing scrolls
    rerender(React.createElement(X.Explore, { markers, sources, apiRef, selectedId: "two", reveal: null, onOpen: vi.fn(), onSeeAll: vi.fn() }));
    expect(scrollTo).not.toHaveBeenCalled();
    // a pin was tapped: its card is brought into view
    rerender(React.createElement(X.Explore, { markers, sources, apiRef, selectedId: "three", reveal: { id: "three", focus: false, n: 1 }, onOpen: vi.fn(), onSeeAll: vi.fn() }));
    expect(scrollTo).toHaveBeenCalled();
  });

  it("moves focus to the card only when the keyboard chose the pin", () => {
    const { rerender } = render(React.createElement(X.Explore, { markers, sources, apiRef, selectedId: "two", reveal: { id: "two", focus: false, n: 1 }, onOpen: vi.fn(), onSeeAll: vi.fn() }));
    expect(document.activeElement?.closest("[data-explore-id]")).toBeNull();
    rerender(React.createElement(X.Explore, { markers, sources, apiRef, selectedId: "three", reveal: { id: "three", focus: true, n: 2 }, onOpen: vi.fn(), onSeeAll: vi.fn() }));
    expect(document.activeElement?.closest("[data-explore-id]")?.getAttribute("data-explore-id")).toBe("three");
  });

  it("holds its ranking while a listing is chosen, so the cards never reshuffle under the thumb; it ranks again once nothing is chosen", () => {
    vi.useFakeTimers();
    let centre = ORIGIN;
    let tell: () => void = () => {};
    const live = { current: { view: () => ({ centre, user: null }), onView: (fn: () => void) => { tell = fn; return () => {}; } } };
    const here = [mk("a", 1, { title: "A" }), mk("b", 9, { title: "B" })];
    const order = () => [...document.querySelectorAll("[data-mv2='explore-card']")].map((c) => c.getAttribute("data-explore-id"));
    const { rerender } = render(React.createElement(X.Explore, { markers: here, sources, apiRef: live, selectedId: null, onOpen: vi.fn(), onSeeAll: vi.fn() }));
    expect(order()).toEqual(["a", "b"]);
    // a card is chosen, the map jumps next to "b": the row stays as it was
    rerender(React.createElement(X.Explore, { markers: here, sources, apiRef: live, selectedId: "a", onOpen: vi.fn(), onSeeAll: vi.fn() }));
    centre = at(9);
    act(() => { tell(); vi.advanceTimersByTime(200); });
    expect(order()).toEqual(["a", "b"]);
    // nothing chosen any more: it ranks again around where the map is now
    rerender(React.createElement(X.Explore, { markers: here, sources, apiRef: live, selectedId: null, onOpen: vi.fn(), onSeeAll: vi.fn() }));
    expect(order()).toEqual(["b", "a"]);
  });

  it("holds the ranking only once the map has told it where it is (a pin tapped before the first reading still gets its distances)", () => {
    vi.useFakeTimers();
    let now: { centre: typeof ORIGIN | null; user: null } = { centre: null, user: null };
    let tell: () => void = () => {};
    const early = { current: { view: () => now, onView: (fn: () => void) => { tell = fn; return () => {}; } } };
    const here = [mk("a", 1, { title: "A" }), mk("b", 5, { title: "B" })];
    // a listing is chosen while the map has not reported a position yet: the cards have no distance line
    render(React.createElement(X.Explore, { markers: here, sources, apiRef: early, selectedId: "a", onOpen: vi.fn(), onSeeAll: vi.fn() }));
    expect(document.querySelector("[data-explore-id='a'] [data-mv2='row-meta']")).toBeNull();
    // the first reading arrives: it must not be held back by the choice
    now = { centre: ORIGIN, user: null };
    act(() => { tell(); vi.advanceTimersByTime(200); });
    expect(document.querySelector("[data-explore-id='a'] [data-mv2='row-meta']")!.textContent).toContain("from the map centre");
  });

  it("makes its title a switch to the category list: the groups, Events and Ideas, a check on what is on", () => {
    const onPill = vi.fn();
    const onIdeas = vi.fn();
    render(React.createElement(X.Explore, { markers, sources, apiRef, selectedId: null, pill: "serve", ideas: true, onPill, onIdeas, onOpen: vi.fn(), onSeeAll: vi.fn() }));
    const sw = screen.getByRole("button", { name: S.explore.title as string });
    expect(sw.getAttribute("aria-expanded")).toBe("false");
    expect(sw.getAttribute("aria-controls")).toBe("mv2-explore-body");
    // what the panel is filtered to is said beside the title
    expect(document.querySelector("[data-mv2='explore-filter']")!.textContent).toBe("Serve & care · Ideas");
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector("[data-mv2='explore']")!.getAttribute("data-mode")).toBe("cats");
    const list = screen.getByRole("list", { name: S.explore.categoriesLabel as string });
    const rows = [...list.querySelectorAll("[data-mv2='cat']")];
    expect(rows.map((r) => r.getAttribute("data-cat-id"))).toEqual([...X.PILLS.map((p) => p.id), "ideas"]);
    const on = (id: string) => rows.find((r) => r.getAttribute("data-cat-id") === id)!;
    expect(on("serve").getAttribute("aria-pressed")).toBe("true");
    expect(on("serve").querySelector("[data-icon='Check']")).toBeTruthy();
    expect(on("ideas").getAttribute("aria-pressed")).toBe("true");
    expect(on("worship").getAttribute("aria-pressed")).toBe("false");
    expect(on("worship").querySelector("[data-cat='worship']")).toBeTruthy();   // the group's own colour dot
    // Ideas is a switch beside the groups: it leaves the list open
    fireEvent.click(on("ideas"));
    expect(onIdeas).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-mv2='explore']")!.getAttribute("data-mode")).toBe("cats");
    // a group sends the panel back to its cards, filtered, and focus returns to the title
    fireEvent.click(on("culture"));
    expect(onPill).toHaveBeenCalledWith("culture");
    expect(document.querySelector("[data-mv2='explore']")!.getAttribute("data-mode")).toBe("cards");
    expect(document.activeElement).toBe(sw);
  });

  it("goes back from the list on Escape, and the view that is not shown cannot be reached", () => {
    render(React.createElement(X.Explore, { markers, sources, apiRef, selectedId: null, pill: "all", onPill: vi.fn(), onIdeas: vi.fn(), onOpen: vi.fn(), onSeeAll: vi.fn() }));
    const views = () => [...document.querySelectorAll("[data-mv2='explore-view']")].map((v) => [v.getAttribute("data-view"), v.hasAttribute("inert")]);
    expect(views()).toEqual([["cards", false], ["cats", true]]);
    fireEvent.click(screen.getByRole("button", { name: S.explore.title as string }));
    expect(views()).toEqual([["cards", true], ["cats", false]]);
    fireEvent.keyDown(document.querySelector("[data-mv2='cat']")!, { key: "Escape" });
    expect(document.querySelector("[data-mv2='explore']")!.getAttribute("data-mode")).toBe("cards");
  });

  it("is lowered to its title strip by the handle (a tap, or a swipe down), raised by it again, and a swipe is not also a tap", () => {
    const onMin = vi.fn();
    const { rerender } = render(React.createElement(X.Explore, { markers, sources, apiRef, selectedId: null, min: false, onMin, onOpen: vi.fn(), onSeeAll: vi.fn() }));
    const grab = screen.getByRole("button", { name: S.explore.lower as string });
    expect(grab.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(grab);
    expect(onMin).toHaveBeenLastCalledWith(true);
    // a swipe down lowers it once (the click that may follow a mouse drag is ignored)
    onMin.mockClear();
    fireEvent.pointerDown(grab, { clientY: 100 });
    fireEvent.pointerUp(grab, { clientY: 140 });
    fireEvent.click(grab);
    expect(onMin.mock.calls).toEqual([[true]]);
    // lowered: the handle says it raises, a swipe up raises it, and the title raises it too
    rerender(React.createElement(X.Explore, { markers, sources, apiRef, selectedId: null, min: true, onMin, onOpen: vi.fn(), onSeeAll: vi.fn() }));
    expect(document.querySelector("[data-mv2='explore']")!.hasAttribute("data-min")).toBe(true);
    const up = screen.getByRole("button", { name: S.explore.raise as string });
    expect(up.getAttribute("aria-expanded")).toBe("false");
    onMin.mockClear();
    fireEvent.pointerDown(up, { clientY: 140 });
    fireEvent.pointerUp(up, { clientY: 100 });
    expect(onMin.mock.calls).toEqual([[false]]);
    onMin.mockClear();
    fireEvent.click(screen.getByRole("button", { name: S.explore.title as string }));
    expect(onMin).toHaveBeenCalledWith(false);
  });

  it("shows a plain line when nothing is near", () => {
    render(React.createElement(X.Explore, { markers: [], sources, apiRef, selectedId: null, onOpen: vi.fn(), onSeeAll: vi.fn() }));
    expect(screen.getByText(S.explore.empty as string)).toBeTruthy();
  });
});

describe("the folding nav", () => {
  let nav: { page: string; params: Record<string, unknown> };
  const go = vi.fn();
  beforeEach(() => {
    nav = { page: "home", params: {} };
    go.mockClear();
    const w = window as unknown as Record<string, unknown>;
    w.useApp = () => ({ nav, go, unreadMsgs: 0, unreadNotifs: 0 });
    w.ProfilePanel = function ProfilePanel({ anchor, extras }: { anchor: string; extras: boolean }) {
      return React.createElement("div", { "data-testid": "menu", "data-anchor": anchor, "data-extras": String(extras) });
    };
  });
  const Nav = () => (window as unknown as { MapV2Nav: React.ComponentType }).MapV2Nav;

  it("maps each screen to its item, and each item to its screen", () => {
    expect(N.currentOf({ page: "home", params: {} })).toBe("home");
    expect(N.currentOf({ page: "home", params: { view: "map" } })).toBe("map");
    expect(N.currentOf({ page: "kingdom-discovery", params: {} })).toBe("explore");
    expect(N.currentOf({ page: "explore", params: {} })).toBe("explore"); // #210 part 3: the Discover page
    expect(N.currentOf({ page: "messages", params: {} })).toBe("profile");
    expect(N.currentOf({ page: "profile", params: {} })).toBe("profile");
    expect(N.currentOf({ page: "profile", params: { id: "x" } })).toBe("");
    expect(N.currentOf({ page: "event", params: { id: "x" } })).toBe("");
    expect(N.targetOf("home")).toEqual(["home", {}]);
    expect(N.targetOf("map")).toEqual(["home", { view: "map" }]);
    expect(N.targetOf("explore")).toEqual(["explore", {}]);
    expect(N.targetOf("profile")).toBeNull();
    expect(N.ITEMS.map((i) => i.id)).toEqual(["home", "explore", "map", "profile"]);
  });

  it("folds into one button that opens the bar of four, the current one marked", () => {
    render(React.createElement(Nav()));
    const toggle = screen.getByRole("button", { name: S.nav.open as string });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    const bar = screen.getByRole("navigation", { name: S.nav.label as string });
    const items = bar.querySelectorAll("[data-mv2='nav-item']");
    expect([...items].map((b) => b.textContent)).toEqual(["Home", "Explore", "Map", "Profile"]);
    expect(screen.getByRole("button", { name: "Home" }).getAttribute("aria-current")).toBe("page");
    expect(document.querySelector("[data-mv2='nav-dim']")).toBeTruthy();
  });

  it("goes where each item says, and Profile opens the account menu with Projects, Messages and Alerts", () => {
    render(React.createElement(Nav()));
    fireEvent.click(screen.getByRole("button", { name: S.nav.open as string }));
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(go).toHaveBeenCalledWith("home", { view: "map" });
    fireEvent.click(screen.getByRole("button", { name: S.nav.open as string }));
    const profile = screen.getByRole("button", { name: "Profile" });
    fireEvent.click(profile);
    expect(profile.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByTestId("menu");
    expect(menu.getAttribute("data-anchor")).toBe("nav");
    expect(menu.getAttribute("data-extras")).toBe("true");
  });

  it("folds back after a while untouched, on Escape, and on a tap on the dimmed map", () => {
    vi.useFakeTimers();
    render(React.createElement(Nav()));
    fireEvent.click(screen.getByRole("button", { name: S.nav.open as string }));
    act(() => { vi.advanceTimersByTime(N.IDLE_MS - 100); });
    expect(screen.queryByRole("navigation")).toBeTruthy();
    // a touch inside starts the count again
    fireEvent.pointerDown(screen.getByRole("button", { name: "Explore" }));
    act(() => { vi.advanceTimersByTime(N.IDLE_MS - 100); });
    expect(screen.queryByRole("navigation")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole("navigation")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: S.nav.open as string }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("navigation")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: S.nav.open as string }));
    fireEvent.click(document.querySelector("[data-mv2='nav-dim']")!);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("says when something is unread, with a dot and in the button's name", () => {
    (window as unknown as Record<string, unknown>).useApp = () => ({ nav, go, unreadMsgs: 2, unreadNotifs: 1 });
    render(React.createElement(Nav()));
    const toggle = screen.getByRole("button", { name: S.nav.openUnread as string });
    expect(toggle.querySelector("[data-mv2='nav-dot']")).toBeTruthy();
  });
});

describe("the stylesheet and the wiring", () => {
  const css = read("src/frontend/assets/map-v2.css");
  const light = css.slice(css.indexOf(":root {"), css.indexOf("[data-theme='dark'] {"));
  const dark = css.slice(css.indexOf("[data-theme='dark'] {"), css.indexOf("/* ── 3. Reduced motion"));

  it("defines one colour token per group in both looks, and a rule that hands it to [data-cat]", () => {
    for (const g of X.GROUPS) {
      expect(light, g).toMatch(new RegExp(`--cat-${g}: #[0-9a-f]{6};`));
      expect(dark, g).toMatch(new RegExp(`--cat-${g}: #[0-9a-f]{6};`));
      expect(css).toContain(`[data-cat='${g}'] {\n  --cat-c: var(--cat-${g});`);
    }
  });

  it("keeps every nav, pill and Explore control at least a thumb's size", () => {
    // every regex character of the selector is escaped (brackets alone is an incomplete escape: CodeQL js/incomplete-sanitization)
    const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const sel of ["[data-mv2='pill']", "[data-mv2='home-search']", "[data-mv2='cat']"]) {
      expect(css).toMatch(new RegExp(escapeRe(sel) + " \\{[^}]*min-height: var\\(--hit\\)"));
    }
    // the panel's title line is 36 px (founder, 2026-10-30: more map); each of its two buttons reaches 4 px past its text
    // above and below (the ::after), so a thumb still has 44 px to land on
    expect(light).toMatch(/--explore-head-h: 36px;/);
    expect(css).toMatch(/\[data-mv2='explore-switch'\],\s*\[data-mv2='explore-all'\] \{[^}]*min-height: var\(--explore-head-h\)/);
    expect(css).toMatch(/\[data-mv2='explore-switch'\]::after,\s*\[data-mv2='explore-all'\]::after \{[^}]*inset: calc\(var\(--space-1\) \* -1\) calc\(var\(--space-2\) \* -1\)/);
    expect(light).toMatch(/--explore-grab-h: 24px;/);
    expect(css).toMatch(/\[data-mv2='explore-grab'\] \{[^}]*width: 100%;[^}]*height: var\(--explore-grab-h\)/);
    expect(css).toMatch(/\[data-mv2='nav-toggle'\] \{[^}]*width: var\(--nav-btn\);[^}]*height: var\(--nav-btn\);/);
    expect(css).toMatch(/\[data-mv2='nav-item'\] \{[^}]*min-width: var\(--nav-btn\);[^}]*min-height: var\(--nav-btn\);/);
    expect(css).toMatch(/\[data-mv2='nav-close'\] \{[^}]*width: var\(--hit\);[^}]*height: var\(--hit\);/);
    expect(light).toMatch(/--nav-btn: 56px;/);
  });

  it("hides only zoom and locate on the home screen while the panel is up (the Online globe is a feature and stays), and brings them back when it is lowered", () => {
    expect(css).toMatch(/\[data-mv2='home'\]\[data-narrow\]:not\(\[data-clean\]\):not\(\[data-explore-min\]\) \.maplibregl-ctrl-group:has\(\.maplibregl-ctrl-zoom-in, \.maplibregl-ctrl-geolocate\) \{[^}]*visibility: hidden;[^}]*pointer-events: none;/);
    // never a rule that hides every control group (the globe is one), and the clean map and the lowered panel are never matched
    expect(css).not.toMatch(/\[data-mv2='home'\][^{]*\.maplibregl-ctrl-group \{[^}]*visibility: hidden/);
    expect(css).toMatch(/--ctrl-btn: 36px;/);
  });

  it("keeps every Explore card one height, distance line or not (a refill never shifts the map's controls)", () => {
    expect(css).toMatch(/\[data-mv2='explore-card'\] \[data-mv2='row-title'\] \{\s*min-height: calc\(var\(--lh-2\) \* 2\);/);
    expect(css).toMatch(/\[data-mv2='explore-card'\] \[data-mv2='card-copy'\] \{\s*min-height: calc\(var\(--lh-1\) \* 2 \+ var\(--lh-2\) \* 2 \+ var\(--space-2\) \* 2\);/);
  });

  it("animates the nav from the duration tokens only (reduced motion makes it instant)", () => {
    expect(css).toMatch(/\[data-mv2='nav-bar'\] \{[^}]*animation: mv2-nav-in var\(--dur-base\)/);
    expect(css).toMatch(/\[data-mv2='nav-dim'\] \{[^}]*animation: mv2-fade-in var\(--dur-base\)/);
  });

  it("registers both modules after the sheet and before the home screen, in the page and in the build", () => {
    const html = read("src/frontend/index.html");
    const build = read("scripts/build-frontend.js");
    for (const [f, v] of [["map-v2-explore.jsx", "20261031a"], ["map-v2-nav.jsx", "20261026c"]]) {
      expect(html).toContain(`src="app/${f}?v=${v}"`);
      expect(html.indexOf("app/map-v2-sheet.jsx")).toBeLessThan(html.indexOf("app/" + f));
      expect(html.indexOf("app/" + f)).toBeLessThan(html.indexOf("app/home.jsx"));
      expect(build.indexOf("'map-v2-sheet.jsx'")).toBeLessThan(build.indexOf(`'${f}'`));
      expect(build.indexOf(`'${f}'`)).toBeLessThan(build.indexOf("'home.jsx'"));
    }
    expect(read("src/frontend/app/map-v2-lib.jsx")).toContain("/assets/map-v2.css?v=20261101a");
  });

  it("the folding nav is the only nav: no bottom bar is left in the shell", () => {
    const shell = read("src/frontend/app/shell.jsx");
    expect(shell).toContain("React.createElement(window.MapV2Nav)");
    expect(shell).not.toContain("BottomNav");
  });
});
