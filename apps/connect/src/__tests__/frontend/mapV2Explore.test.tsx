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

type Marker = { id: string; type: string; title: string; category?: string; lat?: number; lng?: number; kind?: string; ownerName?: string };
type Ranked = { m: Marker; meters: number };
type ExploreApi = {
  ROW_CAP: number;
  GROUPS: string[];
  GROUP_OF: Record<string, string>;
  PILLS: { id: string; group?: boolean; icon?: string }[];
  groupOf: (m: unknown) => string;
  INTENTS: { id: string; icon: string; categories: string[] }[];
  intentOf: (id: string | null) => { id: string; categories: string[] } | null;
  intentMatches: (id: string, m: unknown) => boolean;
  matchesFilter: (pill: string | null, intent: string | null, m: unknown) => boolean;
  pillMatches: (pill: string, m: unknown) => boolean;
  rank: (origin: { lat: number; lng: number } | null, markers: Marker[], selectedId: string | null, cap?: number) => Ranked[];
  Pills: React.ComponentType<{ value: string; onChange: (id: string) => void; ideas: boolean; onIdeas: () => void }>;
  Categories: React.ComponentType<{ value: string; ideas: boolean; onPick: (id: string) => void; onIdeas: () => void }>;
  Intents: React.ComponentType<{ value: string | null; onPick: (id: string) => void }>;
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

describe("Where to… (C40): each intent is a saved set of existing categories", () => {
  const MAP: Record<string, string[]> = {
    coffee: ["hospitality-cafes"],
    learn: ["education-equipping", "education-training"],
    worship: ["worship-prayer", "church-services", "conferences-summits", "churches-ministries"],
    run: ["sport-recreation", "recreation-sport"],
    reset: ["retreat-healing", "safe-spaces"],
    heal: ["health-wellness", "care-recovery", "clinic", "rehab-development"],
    parent: ["marriage-family", "kids"],
    chill: ["social-gatherings", "arts-culture", "arts-creative"],
    shop: ["retail-shopping", "markets-expos"],
    serve: ["outreach-missions", "community-upliftment"],
  };
  const wordsOf = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const intents = () => S.explore.intents as Record<string, string>;
  const whereTo = (word: string) => (S.explore.whereTo as (w: string) => string)(word);
  const emptyIntent = (word: string) => (S.explore.emptyIntent as (w: string) => string)(word);

  it("maps the ten intents onto existing categories, with no category in two intents", () => {
    expect(X.INTENTS.map((intent) => intent.id)).toEqual(Object.keys(MAP));
    const seen = new Set<string>();
    for (const intent of X.INTENTS) {
      expect(intent.categories, intent.id).toEqual(MAP[intent.id]);
      expect(intent.categories.length, intent.id).toBeGreaterThan(0);
      for (const id of intent.categories) {
        expect(X.GROUP_OF[id], intent.id + " " + id).toBeTruthy();
        expect(seen.has(id), id).toBe(false);
        seen.add(id);
      }
    }
    // the spec's two examples, spelled out
    expect(MAP.coffee).toEqual(["hospitality-cafes"]);
    expect(MAP.heal).toEqual(expect.arrayContaining(["health-wellness", "care-recovery"]));
    // serve is not the whole Serve & care group (heal and reset stay separate) and is not disabled
    expect(MAP.serve).not.toEqual(expect.arrayContaining(["health-wellness", "retreat-healing"]));
  });

  it("filters a marker by its category, and an intent wins over a pill", () => {
    const cafe = mk("cafe", 1, { type: "place", category: "hospitality-cafes" });
    const church = mk("church", 1);
    const clinic = mk("clinic", 1, { category: "clinic" });
    const outreach = mk("out", 1, { type: "event", category: "outreach-missions" });
    expect(X.intentMatches("coffee", cafe)).toBe(true);
    expect(X.intentMatches("coffee", church)).toBe(false);
    expect(X.intentMatches("heal", clinic)).toBe(true);
    expect(X.intentMatches("heal", cafe)).toBe(false);
    expect(X.intentMatches("serve", outreach)).toBe(true);
    expect(X.intentMatches("serve", clinic)).toBe(false);
    expect(X.intentMatches("nope", cafe)).toBe(false);
    expect(X.intentMatches("coffee", null)).toBe(false);
    expect(X.intentMatches("coffee", { category: "constructor" })).toBe(false);
    expect(X.intentOf("coffee")!.categories).toEqual(["hospitality-cafes"]);
    expect(X.intentOf("nope")).toBeNull();
    expect(X.matchesFilter("worship", "coffee", cafe)).toBe(true);
    expect(X.matchesFilter("worship", "coffee", church)).toBe(false);
    expect(X.matchesFilter("worship", null, church)).toBe(true);
    expect(X.matchesFilter("events", "nope", mk("ev", 1, { type: "event", category: "kids" }))).toBe(true);
  });

  it("names each intent in twelve words or fewer, including the empty line", () => {
    for (const intent of X.INTENTS) {
      const word = intents()[intent.id];
      expect(word, intent.id).toBeTruthy();
      expect(wordsOf(whereTo(word)), intent.id).toBeLessThanOrEqual(12);
      expect(wordsOf(emptyIntent(word)), intent.id).toBeLessThanOrEqual(12);
      expect(emptyIntent(word)).toBe("Nothing nearby for where to " + word + ".");
    }
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

describe("Explore panel (founder, 2026-11-17: rest, strip, focus, open)", () => {
  const view = { centre: ORIGIN, user: null as null | { lat: number; lng: number } };
  const apiRef = { current: { view: () => view, onView: () => () => {} } };
  const markers = [mk("one", 1, { title: "First church" }), mk("two", 3, { title: "Second café", category: "hospitality-cafes", type: "place", ownerName: "Anchor Community Church" }), mk("three", 6, { title: "Third", type: "event", category: "kids" })];
  const sources = { contributors: [{ id: "one", coverPhoto: "https://img.test/one.jpg" }], places: [], events: [] };
  const P = () => (S.explore as unknown as { panel: Record<string, string> }).panel;
  const mode = () => document.querySelector("[data-mv2='explore']")!.getAttribute("data-mode");
  // The map screen owns the focus; this stands in for it.
  function Harness(props: Record<string, unknown>) {
    const [focus, setFocus] = React.useState<unknown>(null);
    const onReset = () => { setFocus(null); if (typeof props.onReset === "function") (props.onReset as () => void)(); };
    return React.createElement(X.Explore, { markers, sources, apiRef, selectedId: null, onOpen: vi.fn(), onSeeAll: vi.fn(), ...props, focus, onFocus: setFocus, onReset });
  }
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).ProfilePanel = function ProfilePanel({ anchor, extras }: { anchor: string; extras: string[] }) {
      return React.createElement("div", { "data-testid": "me-menu", "data-anchor": anchor, "data-extras": String(extras) });
    };
  });

  it("rests on the crown alone, and the crown shows and hides the Where to… tiles (no title text, only the handle)", () => {
    render(React.createElement(Harness));
    expect(mode()).toBe("rest");
    expect(document.querySelector("[data-mv2='explore']")!.hasAttribute("inert")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: P().open }));
    expect(mode()).toBe("strip");
    expect(document.querySelector("[data-mv2='explore']")!.hasAttribute("inert")).toBe(false);
    expect(screen.getByRole("button", { name: "Coffee" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kids" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Contributors" })).toBeNull();
    // the strip says nothing but its tiles: no "Explore", "Where to…", "Near you" or count line
    expect(screen.queryByRole("heading")).toBeNull();
    expect(document.querySelector("[data-mv2='explore-peek']")).toBeNull();
    expect(document.querySelector("[data-mv2='explore-handle']")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: P().close }));
    expect(mode()).toBe("rest");
  });

  it("a tile takes the panel to its focus: grey tabs and its cards, and All types (plain words) goes back", () => {
    render(React.createElement(Harness));
    fireEvent.click(screen.getByRole("button", { name: P().open }));
    fireEvent.click(screen.getByRole("button", { name: "Coffee" }));
    expect(mode()).toBe("focus");
    expect(screen.getByRole("tab", { name: "Coffee" }).getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector("[data-row='tile'] [data-explore-id='two']")).toBeTruthy();
    expect(document.querySelector("[data-row='tile'] [data-explore-id='two'] [data-mv2='xcard-by']")!.textContent).toBe("by Anchor Community Church");
    expect(document.querySelector("[data-row='tile'] [data-explore-id='one']")).toBeNull();
    // another tab keeps the focus (and so the panel's height): only the row changes
    fireEvent.click(screen.getByRole("tab", { name: "Kids" }));
    expect(mode()).toBe("focus");
    expect(document.querySelector("[data-row='tile'] [data-explore-id='three']")).toBeTruthy();
    const reset = screen.getByRole("button", { name: P().allTypes });
    expect(reset.getAttribute("data-mv2")).toBe("explore-reset");
    fireEvent.click(reset);
    expect(mode()).toBe("strip");
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("the handle opens every row; Explore more calls onSeeAll; a card there takes its row over and reports the listing", () => {
    const onSeeAll = vi.fn();
    const onOpen = vi.fn();
    render(React.createElement(Harness, { selectedId: "two", onOpen, onSeeAll }));
    fireEvent.click(screen.getByRole("button", { name: P().open }));
    fireEvent.click(screen.getByRole("button", { name: P().raise }));
    expect(mode()).toBe("open");
    fireEvent.click(screen.getByRole("button", { name: P().seeAll }));
    expect(onSeeAll).toHaveBeenCalled();
    const sel = document.querySelector("[data-row='more'] [data-explore-id='two']")!;
    expect(sel.hasAttribute("data-selected")).toBe(true);
    expect(sel.querySelector("[data-mv2='xcard-badge']")!.textContent).toBe(S.explore.selectedBadge);
    fireEvent.click(sel);
    expect(onOpen).toHaveBeenCalledWith("two", "place");
    expect(mode()).toBe("focus");
    expect(screen.getByRole("tablist", { name: P().rows })).toBeTruthy();
    expect(screen.getByRole("tab", { name: P().more }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: P().closeRow }));
    expect(mode()).toBe("strip");
  });

  it("tells the map which pins a row in focus holds", () => {
    const onSectionIds = vi.fn();
    render(React.createElement(Harness, { onSectionIds }));
    fireEvent.click(screen.getByRole("button", { name: P().open }));
    fireEvent.click(screen.getByRole("button", { name: P().raise }));
    fireEvent.click(screen.getByRole("button", { name: P().more }));
    expect(mode()).toBe("focus");
    expect(onSectionIds).toHaveBeenLastCalledWith(["two", "three"]);
  });

  it("with a filter on, the crown clears everything and comes back to rest", () => {
    const onReset = vi.fn();
    render(React.createElement(Harness, { onReset }));
    fireEvent.click(screen.getByRole("button", { name: P().open }));
    fireEvent.click(screen.getByRole("button", { name: "Coffee" }));
    fireEvent.click(screen.getByRole("button", { name: P().reset }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(mode()).toBe("rest");
    // a search filter from the map screen counts too
    render(React.createElement(Harness, { onReset, filtered: true }));
    expect(screen.getAllByRole("button", { name: P().reset }).length).toBe(1);
  });

  it("a keyboard pin opens the panel onto that card", () => {
    const { rerender } = render(React.createElement(Harness, { reveal: null }));
    rerender(React.createElement(Harness, { selectedId: "three", reveal: { id: "three", focus: true, n: 1 } }));
    expect(mode()).toBe("focus");
    expect(document.activeElement?.closest("[data-explore-id]")?.getAttribute("data-explore-id")).toBe("three");
  });

  it("hides Do and Central, keeps Map in the middle, and Me opens the account menu with Messages and Alerts", () => {
    const onGo = vi.fn();
    render(React.createElement(Harness, { onGo }));
    fireEvent.click(screen.getByRole("button", { name: P().open }));
    fireEvent.click(screen.getByRole("button", { name: P().raise }));
    const dock = screen.getByRole("navigation", { name: P().dock });
    expect([...dock.querySelectorAll("[data-nav]")].map((b) => b.getAttribute("data-nav"))).toEqual(["explore", "map", "me"]);
    expect(document.querySelector("[data-nav='do']")).toBeNull();
    expect(document.querySelector("[data-nav='central']")).toBeNull();
    // the crown has given way to the nav outright
    expect(document.querySelector("[data-mv2='explore-crown']")).toBeNull();
    const me = dock.querySelector("[data-nav='me']")!;
    fireEvent.click(me);
    expect(me.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByTestId("me-menu");
    expect(menu.getAttribute("data-anchor")).toBe("dock");
    expect(menu.getAttribute("data-extras")).toBe("messages,notifications");
    fireEvent.click(dock.querySelector("[data-nav='map']")!);
    expect(mode()).toBe("rest");
    expect(document.querySelector("[data-mv2='explore-crown']")).toBeTruthy();
  });

  it("puts every live category on exactly one tile", () => {
    const seen = new Set<string>();
    for (const t of (X as unknown as { TILES: { id: string; categories: string[] }[] }).TILES) {
      for (const c of t.categories) {
        expect(seen.has(c), c).toBe(false);
        seen.add(c);
      }
    }
    for (const id of new Set(Object.keys(X.GROUP_OF))) {
      if (!seen.has(id) && id !== "") expect(seen.has(id), id).toBe(true);
    }
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
    expect(N.currentOf({ page: "lets", params: {} })).toBe("profile");
    expect(N.currentOf({ page: "community", params: {} })).toBe("profile");
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
    for (const sel of ["[data-mv2='pill']", "[data-mv2='home-search']"]) {
      expect(css).toMatch(new RegExp(escapeRe(sel) + " \\{[^}]*min-height: var\\(--hit\\)"));
    }
    // the category row and the Where to… row share one rule; the list's own tabs are their own
    expect(css).toMatch(/\[data-mv2='cat'\],\s*\[data-mv2='intent'\] \{[^}]*min-height: var\(--hit\)/);
    expect(css).toMatch(/\[data-mv2='intent-tab'\] \{[^}]*min-height: var\(--hit\)/);
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
    for (const [f, v] of [["map-v2-explore.jsx", "20261117a"], ["map-v2-nav.jsx", "20261026c"]]) {
      expect(html).toContain(`src="app/${f}?v=${v}"`);
      expect(html.indexOf("app/map-v2-sheet.jsx")).toBeLessThan(html.indexOf("app/" + f));
      expect(html.indexOf("app/" + f)).toBeLessThan(html.indexOf("app/home.jsx"));
      expect(build.indexOf("'map-v2-sheet.jsx'")).toBeLessThan(build.indexOf(`'${f}'`));
      expect(build.indexOf(`'${f}'`)).toBeLessThan(build.indexOf("'home.jsx'"));
    }
    expect(read("src/frontend/app/map-v2-lib.jsx")).toContain("/assets/map-v2.css?v=20261117a");
    const home = read("src/frontend/app/home.jsx");
    expect(home).toContain("X.tileMatches(tile, m)");
    expect(home).toContain("onSeeAll: () => app.go('explore')");
    expect(read("src/frontend/app/shell.jsx")).toContain("SHOW_CREATE_ON_MAP = false");
  });

  it("the folding nav is the only nav: no bottom bar is left in the shell", () => {
    const shell = read("src/frontend/app/shell.jsx");
    expect(shell).toContain("React.createElement(window.MapV2Nav)");
    expect(shell).not.toContain("BottomNav");
  });
});
