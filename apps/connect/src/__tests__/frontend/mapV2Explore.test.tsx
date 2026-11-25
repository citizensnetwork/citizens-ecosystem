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
      expect(emptyIntent(word)).toBe("Nothing nearby for " + word + ".");
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

  it("rests on the crown alone, and the crown shows and hides the Where Christians… strip (handle + brand mark)", () => {
    render(React.createElement(Harness));
    expect(mode()).toBe("rest");
    expect(document.querySelector("[data-mv2='explore']")!.hasAttribute("inert")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: P().open }));
    expect(mode()).toBe("strip");
    expect(document.querySelector("[data-mv2='explore']")!.hasAttribute("inert")).toBe(false);
    expect(screen.getByRole("button", { name: "Coffee" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kids" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Contributors" })).toBeNull();
    // strip lead above the tiles (founder, 2026-11-22); no old "Explore" / count line
    expect(screen.getByRole("heading", { name: P().whereLead })).toBeTruthy();
    expect(document.querySelector("[data-mv2='explore-peek']")).toBeNull();
    expect(document.querySelector("[data-mv2='explore-handle']")).toBeTruthy();
    // no chevron on the handle: the gold nudge under the nav says there is more (founder, 2026-11-25)
    expect(document.querySelector("[data-mv2='explore-handle'] svg")).toBeNull();
    expect(document.querySelector("[data-mv2='drawer-mark']")!.textContent).toBe(P().brandMark);
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
    const back = screen.getByRole("button", { name: P().closeRow });
    expect(back.getAttribute("data-mv2")).toBe("xfocus-back");
    fireEvent.click(back);
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
    // the third argument is where the cards measured from, so the sheet's distance says what the card said
    expect(onOpen).toHaveBeenCalledWith("two", "place", { centre: ORIGIN, user: null });
    expect(mode()).toBe("focus");
    expect(screen.getByRole("tablist", { name: P().rows })).toBeTruthy();
    expect(screen.getByRole("tab", { name: P().more }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: P().closeRow }));
    expect(document.querySelector("[data-mv2='xfocus-back']")).toBeNull();
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

  it("the sticky nav is Me, Explore, Map and Do (no Central): Me and Explore are pages, Do opens its menu, Map rests", () => {
    const onGo = vi.fn();
    render(React.createElement(Harness, { onGo }));
    fireEvent.click(screen.getByRole("button", { name: P().open }));
    fireEvent.click(screen.getByRole("button", { name: P().raise }));
    const dock = screen.getByRole("navigation", { name: P().dock });
    expect([...dock.querySelectorAll("[data-nav]")].map((b) => b.getAttribute("data-nav"))).toEqual(["me", "explore", "map", "do"]);
    expect(document.querySelector("[data-nav='central']")).toBeNull();
    // the crown has given way to the nav outright
    expect(document.querySelector("[data-mv2='explore-crown']")).toBeNull();
    fireEvent.click(dock.querySelector("[data-nav='me']")!);
    expect(onGo).toHaveBeenLastCalledWith("profile", {});
    fireEvent.click(dock.querySelector("[data-nav='explore']")!);
    expect(onGo).toHaveBeenLastCalledWith("explore", {});
    const door = dock.querySelector("[data-nav='do']")!;
    fireEvent.click(door);
    expect(door.getAttribute("aria-expanded")).toBe("true");
    const P2 = P() as unknown as { door: { lets: string; community: string } };
    fireEvent.click(screen.getByRole("menuitem", { name: P2.door.community }));
    expect(onGo).toHaveBeenLastCalledWith("community", {});
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(dock.querySelector("[data-nav='map']")!);
    expect(mode()).toBe("rest");
    expect(document.querySelector("[data-mv2='explore-crown']")).toBeTruthy();
  });

  describe("on a phone (founder, 2026-11-25): the nav stands where the crown stood", () => {
    const real = window.matchMedia;
    beforeEach(() => {
      (window as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
        matches: q === "(max-width: 767px)", media: q, addEventListener: () => {}, removeEventListener: () => {},
      });
    });
    afterEach(() => { (window as unknown as { matchMedia: unknown }).matchMedia = real; });

    it("rests on the nav over the nudge, with no crown; the nudge shows Where to…; opening moves the same nav down", () => {
      const onGo = vi.fn();
      render(React.createElement(Harness, { onGo }));
      expect(mode()).toBe("rest");
      expect(document.querySelector("[data-mv2='explore-crown']")).toBeNull();
      const dock = () => document.querySelector("[data-mv2='explore-dock']")!;
      expect(dock().hasAttribute("data-ride")).toBe(true);
      expect(dock().hasAttribute("data-rest")).toBe(true);
      const first = dock();
      fireEvent.click(screen.getByRole("button", { name: (P() as unknown as { nudge: string }).nudge }));
      expect(mode()).toBe("strip");
      expect(dock().hasAttribute("data-rest")).toBe(false);
      expect(document.querySelector("[data-mv2='explore-nudge']")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: P().raise }));
      expect(mode()).toBe("open");
      // one element throughout, so it glides rather than swaps
      expect(dock()).toBe(first);
      expect(dock().hasAttribute("data-ride")).toBe(false);
      fireEvent.click(dock().querySelector("[data-nav='me']")!);
      expect(onGo).toHaveBeenLastCalledWith("profile", {});
    });

    it("the top-left crown's signal folds every panel back to rest", () => {
      render(React.createElement(Harness));
      fireEvent.click(screen.getByRole("button", { name: (P() as unknown as { nudge: string }).nudge }));
      fireEvent.click(screen.getByRole("button", { name: P().raise }));
      expect(mode()).toBe("open");
      act(() => { window.dispatchEvent(new Event("cc-crown-home")); });
      expect(mode()).toBe("rest");
    });
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
    for (const [f, v] of [["map-v2-explore.jsx", "20261123h"], ["map-v2-nav.jsx", "20261026c"]]) {
      expect(html).toContain(`src="app/${f}?v=${v}"`);
      expect(html.indexOf("app/map-v2-sheet.jsx")).toBeLessThan(html.indexOf("app/" + f));
      expect(html.indexOf("app/" + f)).toBeLessThan(html.indexOf("app/home.jsx"));
      expect(build.indexOf("'map-v2-sheet.jsx'")).toBeLessThan(build.indexOf(`'${f}'`));
      expect(build.indexOf(`'${f}'`)).toBeLessThan(build.indexOf("'home.jsx'"));
    }
    expect(read("src/frontend/app/map-v2-lib.jsx")).toContain("/assets/map-v2.css?v=20261123e");
    const sheetCss = read("src/frontend/assets/map-v2.css");
    expect(sheetCss).toMatch(/\[data-mv2='explore'\] \{[\s\S]*?touch-action: none;/);
    // Where-to category tiles swipe sideways in focus and in the open preview (founder, 2026-11-23)
    expect(sheetCss).toMatch(
      /\[data-mv2='explore'\]:not\(\[data-open\]\) \[data-mv2='explore-tiles'\][\s\S]*?touch-action: pan-x;/,
    );
    expect(sheetCss).toMatch(
      /\[data-mv2='explore'\]\[data-open\] \[data-mv2='explore-tiles'\][\s\S]*?touch-action: pan-x pan-y;/,
    );
    // raised: body scrolls; every child restates pan-y (overflow ends the chain)
    expect(sheetCss).toMatch(
      /\[data-mv2='pinpeek'\]\[data-raised\] \[data-mv2='pinpeek-body'\] \{[\s\S]*?overflow-y: auto;[\s\S]*?touch-action: pan-y;/,
    );
    expect(sheetCss).toMatch(
      /\[data-mv2='pinpeek'\]\[data-raised\] \[data-mv2='pinpeek-body'\] \*[\s\S]*?touch-action: pan-y;/,
    );
    // rows use pan-x pan-y (same as a full sheet): pan-x alone ∩ body's pan-y = none and kills vertical swipe
    expect(sheetCss).toMatch(
      /\[data-mv2='sheet'\]\[data-inline\] \[data-mv2='scroller'\],\s*\[data-mv2='sheet'\]\[data-inline\] \[data-mv2='scroller'\]\[data-top\] \{[\s\S]*?--mv2-ta-row: pan-x pan-y;/,
    );
    expect(sheetCss).toMatch(
      /\[data-mv2='pinpeek'\]\[data-raised\] \[data-mv2='pinpeek-body'\] \[data-mv2='xrow'\][\s\S]*?touch-action: pan-x pan-y;/,
    );
    const home = read("src/frontend/app/home.jsx");
    expect(home).toContain("X.tileMatches(tile, m)");
    expect(home).toContain("onSeeAll: () => app.go('explore')");
    expect(read("src/frontend/app/shell.jsx")).toContain("SHOW_CREATE_ON_MAP = false");
  });

  it("one nav per width: the rail on a wide screen, the floating crown and nav on a phone, and no bottom bar", () => {
    const shell = read("src/frontend/app/shell.jsx");
    expect(shell).toContain("wide ? React.createElement(AppRail) : React.createElement(PhoneChrome)");
    expect(shell).toContain("new Event('cc-crown-home')");
    expect(shell).not.toContain("BottomNav");
    const home = read("src/frontend/app/home.jsx");
    expect(home).toContain("window.addEventListener('cc-crown-home', home)");
    const css = read("src/frontend/assets/map-v2.css");
    expect(css).toMatch(/\[data-mv2='explore-dock'\]\[data-ride\] \{\s*transform: translate\(-50%, calc\(var\(--xp-vis\) \* -1\)\);/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\[data-mv2='explore-nudge'\] \{\s*animation: none;/);
  });
});

describe("the map home's levels (founder, 2026-11-18): the pin carousel and the crown", () => {
  type PeekApi = {
    peekOrder: (target: Marker | null, markers: Marker[], visible: string[] | null, cap?: number) => Marker[];
    nearestIndex: (centres: number[], mid: number) => number;
    PinCarousel: React.ComponentType<Record<string, unknown>>;
  };
  const Y = () => X as unknown as PeekApi;
  const PK = () => (S.explore as unknown as { peek: Record<string, unknown> & { count: (i: number, n: number) => string; details: (n: string) => string } }).peek;
  const P = () => (S.explore as unknown as { panel: Record<string, string> }).panel;
  const pins = [
    mk("a", 0, { type: "place", title: "Alpha", category: "hospitality-cafes" }),
    mk("b", 2, { type: "event", title: "Bravo", category: "kids" }),
    mk("c", 1, { type: "place", title: "Charlie", category: "retail-shopping" }),
    mk("d", 5, { type: "place", title: "Delta", category: "kids" }),
    mk("i", 0.5, { type: "idea", title: "An idea" }),
  ];

  it("prefers building, then street, then suburb for place meta; event date only", () => {
    const api = Y() as PeekApi & {
      placeWhereLine: (a?: string, l?: string) => string;
      eventDateLine: (m: Marker, rec?: Record<string, unknown>) => string;
    };
    expect(api.placeWhereLine("Brooklyn Mall, Fehrsen Street, Brooklyn, Pretoria")).toBe("Brooklyn Mall");
    expect(api.placeWhereLine("587 Rooihuiskraal Road, Garsfontein, Pretoria")).toBe("587 Rooihuiskraal Road");
    expect(api.placeWhereLine("Garsfontein, Pretoria")).toBe("Garsfontein");
    expect(api.placeWhereLine("Hatfield")).toBe("Hatfield");
    expect(api.eventDateLine({ id: "e1", type: "event", title: "Gathering", startsAt: "2026-11-22T09:00:00Z" } as Marker))
      .toMatch(/22\s+Nov\s+2026/);
  });

  it("orders the carousel with the tapped pin centred among nearest neighbours (left/right), ideas never", () => {
    const b = pins.find((m) => m.id === "b")!;
    // nearest alternate right then left: b, then c (right), a (left), d (right) → [a, b, c, d]
    expect(Y().peekOrder(b, pins, null).map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
    // only the pins in the given set (the tapped one is always included)
    expect(Y().peekOrder(b, pins, ["a", "d"]).map((m) => m.id)).toEqual(["d", "b", "a"]);
    // capped, the cap counting the tapped pin
    expect(Y().peekOrder(b, pins, null, 2).map((m) => m.id)).toEqual(["b", "c"]);
    expect(Y().peekOrder(null, pins, null)).toEqual([]);
  });

  it("knows which card a swipe settled on: the one whose middle is nearest the row's middle", () => {
    expect(Y().nearestIndex([74, 234, 394], 240)).toBe(1);
    expect(Y().nearestIndex([74, 234, 394], 0)).toBe(0);
    expect(Y().nearestIndex([74, 234, 394], 9999)).toBe(2);
    expect(Y().nearestIndex([], 10)).toBe(-1);
  });

  function carousel(props: Record<string, unknown> = {}) {
    const calls = { onIndex: vi.fn(), onRaise: vi.fn(), onDive: vi.fn(), onBack: vi.fn(), onClose: vi.fn() };
    const items = [pins[0], pins[2], pins[1]];
    const r = render(React.createElement(Y().PinCarousel, {
      items, index: 0, raised: false, origin: ORIGIN, distWords: S.explore, sources: { places: [], events: [], contributors: [] },
      details: (m: Marker) => React.createElement("p", { "data-testid": "details" }, "About " + m.title),
      ...calls, ...props,
    }));
    return { calls, items, ...r };
  }
  const cardsIn = () => [...document.querySelectorAll<HTMLElement>("[data-mv2='pinpeek'] [data-mv2='xcard']")];

  it("draws the Explore row's own cards, the chosen one with a details cue, and no counter", () => {
    carousel();
    expect(document.querySelector("[data-mv2='pinpeek-body']")).toBeTruthy();
    const cards = cardsIn();
    expect(cards.map((c) => c.getAttribute("data-explore-id"))).toEqual(["a", "c", "b"]);
    expect(cards[0].hasAttribute("data-selected")).toBe(true);
    expect(cards[0].getAttribute("aria-current")).toBe("true");
    expect(cards[0].querySelector("[data-mv2='xcard-cue']")).toBeTruthy();
    expect(cards[0].textContent).toContain((PK().detailsCue || PK().detailsBadge) as string);
    expect(cards[1].hasAttribute("data-selected")).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("Alpha");
    expect(screen.getByRole("status").textContent).not.toMatch(/\d+\s*(of|\/)\s*\d+/);
    // wrap: both arrows stay available at either end
    expect(screen.getByRole("button", { name: PK().prev as string })).toBeTruthy();
    expect(screen.getByRole("button", { name: PK().next as string })).toBeTruthy();
    // lowered: no details, no Back
    expect(screen.queryByTestId("details")).toBeNull();
    expect(screen.queryByRole("button", { name: PK().back as string })).toBeNull();
  });

  it("an arrow or a neighbour's tap chooses that card; the chosen card's tap raises the panel; arrows wrap", () => {
    const { calls, rerender, items } = carousel({ index: 1 });
    const base = {
      items, raised: false, origin: ORIGIN, distWords: S.explore, sources: { places: [], events: [], contributors: [] },
      details: (m: Marker) => React.createElement("p", { "data-testid": "details" }, "About " + m.title),
      ...calls,
    };
    fireEvent.click(screen.getByRole("button", { name: PK().next as string }));
    expect(calls.onIndex).toHaveBeenLastCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: PK().prev as string }));
    expect(calls.onIndex).toHaveBeenLastCalledWith(0);
    // wrap from the last card back to the first
    rerender(React.createElement(Y().PinCarousel, { ...base, index: 2 }));
    fireEvent.click(screen.getByRole("button", { name: PK().next as string }));
    expect(calls.onIndex).toHaveBeenLastCalledWith(0);
    // wrap from the first card to the last
    rerender(React.createElement(Y().PinCarousel, { ...base, index: 0 }));
    fireEvent.click(screen.getByRole("button", { name: PK().prev as string }));
    expect(calls.onIndex).toHaveBeenLastCalledWith(2);
    rerender(React.createElement(Y().PinCarousel, { ...base, index: 1 }));
    fireEvent.click(cardsIn()[2]);
    expect(calls.onIndex).toHaveBeenLastCalledWith(2);
    expect(calls.onRaise).not.toHaveBeenCalled();
    fireEvent.click(cardsIn()[1]);
    expect(calls.onRaise).toHaveBeenCalledTimes(1);
    // Close goes home from any level
    fireEvent.click(screen.getByRole("button", { name: PK().close as string }));
    expect(calls.onClose).toHaveBeenCalledTimes(1);
  });

  it("raised: the chosen card's details sit below the cards, with Back and Close in the bar; Escape steps back", () => {
    const { calls } = carousel({ index: 1, raised: true });
    expect(document.querySelector("[data-mv2='pinpeek']")!.hasAttribute("data-raised")).toBe(true);
    expect(screen.getByTestId("details").textContent).toBe("About Charlie");
    expect(screen.getByRole("region", { name: PK().details("Charlie") })).toBeTruthy();
    // the details come after the cards
    const row = document.querySelector("[data-row='peek']")!;
    expect(row.compareDocumentPosition(screen.getByTestId("details")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // the chosen card no longer shows the details cue: it already opened
    expect(cardsIn()[1].querySelector("[data-mv2='xcard-cue']")).toBeNull();
    fireEvent.click(cardsIn()[1]);
    expect(calls.onRaise).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: PK().back as string }));
    expect(calls.onBack).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(calls.onBack).toHaveBeenCalledTimes(2);
  });

  it("leaves Escape to a full sheet open over it (hidden), and gives focus back when it closes with focus inside", () => {
    const returnFocus = vi.fn();
    const { calls, rerender, unmount } = carousel({ hidden: true, returnFocus });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(calls.onBack).not.toHaveBeenCalled();
    rerender(React.createElement(Y().PinCarousel, {
      items: [pins[0]], index: 0, ...calls, returnFocus, sources: {}, focusCard: 1,
    }));
    // a pin chosen from the keyboard: focus goes into the cards
    expect(document.activeElement && document.activeElement.getAttribute("data-explore-id")).toBe("a");
    unmount();
    expect(returnFocus).toHaveBeenCalledTimes(1);
    expect(returnFocus).toHaveBeenCalledWith("a");
  });

  it("a pull up on the handle or a card raises; a handle tap or pull down steps back (founder, 2026-11-23)", () => {
    const { calls, unmount } = carousel();
    const panel = document.querySelector("[data-mv2='pinpeek']")!;
    const handle = document.querySelector("[data-mv2='handle']")!;
    const card = cardsIn()[0];
    // a short pointer press on the handle steps down (option B); it does not raise
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 400, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerUp(panel, { clientX: 100, clientY: 402, pointerId: 1, pointerType: "touch" });
    expect(calls.onBack).toHaveBeenCalledTimes(1);
    expect(calls.onRaise).not.toHaveBeenCalled();
    // A finger on the cards is read from touch events (founder, 2026-11-25): the row's native scrolling cancels pointer drags.
    const finger = (el: Element, pts: [number, number][]) => {
      fireEvent.touchStart(el, { touches: [{ clientX: pts[0][0], clientY: pts[0][1] }] });
      pts.slice(1).forEach(([x, y]) => fireEvent.touchMove(el, { touches: [{ clientX: x, clientY: y }] }));
      fireEvent.touchEnd(el, { touches: [] });
    };
    // a short press on a card is not a step-down (cards keep their tap-to-raise)
    finger(card, [[100, 400], [100, 402]]);
    expect(calls.onBack).toHaveBeenCalledTimes(1);
    // a vertical card pull raises (restored after handle-only was too tight)
    finger(card, [[100, 400], [104, 360], [104, 330]]);
    expect(calls.onRaise).toHaveBeenCalledTimes(1);
    // a sideways move on a card does not raise (the row keeps pan-x)
    finger(card, [[100, 400], [160, 404], [220, 408]]);
    expect(calls.onRaise).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 400, pointerId: 5, pointerType: "touch" });
    fireEvent.pointerMove(panel, { clientX: 104, clientY: 360, pointerId: 5, pointerType: "touch" });
    fireEvent.pointerUp(panel, { clientX: 104, clientY: 330, pointerId: 5, pointerType: "touch" });
    expect(calls.onRaise).toHaveBeenCalledTimes(2);
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 300, pointerId: 6, pointerType: "touch" });
    fireEvent.pointerMove(panel, { clientX: 100, clientY: 340, pointerId: 6, pointerType: "touch" });
    fireEvent.pointerUp(panel, { clientX: 100, clientY: 380, pointerId: 6, pointerType: "touch" });
    expect(calls.onBack).toHaveBeenCalledTimes(2);
    // Preview body/cards: swipe down also closes (not handle-only) — founder, 2026-11-23.
    finger(card, [[100, 300], [100, 360], [100, 420]]);
    expect(calls.onBack).toHaveBeenCalledTimes(3);
    unmount();
  });

  it("raised: body at scroll-top downward lowers; scrolled body keeps pan-y; bar still steps back", () => {
    const { calls, unmount } = carousel({ raised: true });
    const panel = document.querySelector("[data-mv2='pinpeek']")!;
    const bodyEl = document.querySelector("[data-mv2='pinpeek-body']") as HTMLElement;
    const details = screen.getByTestId("details");
    const bar = document.querySelector("[data-mv2='pinpeek-bar']")!;
    // A finger on the details is read from touch events (founder, 2026-11-25): native scrolling cancels pointer drags.
    // scrolled: content owns the swipe
    Object.defineProperty(bodyEl, "scrollTop", { configurable: true, get: () => 40 });
    fireEvent.touchStart(details, { touches: [{ clientX: 100, clientY: 300 }] });
    fireEvent.touchMove(details, { touches: [{ clientX: 100, clientY: 360 }] });
    fireEvent.touchEnd(details, { touches: [] });
    expect(calls.onBack).not.toHaveBeenCalled();
    // Fresh gesture at scroll-top + down → lower (founder, 2026-11-23). Follows the finger, snaps on release.
    Object.defineProperty(bodyEl, "scrollTop", { configurable: true, get: () => 0 });
    fireEvent.touchStart(details, { touches: [{ clientX: 100, clientY: 300 }] });
    fireEvent.touchMove(details, { touches: [{ clientX: 100, clientY: 360 }] });
    expect((panel as HTMLElement).style.transform).toMatch(/translateY/);
    fireEvent.touchMove(details, { touches: [{ clientX: 100, clientY: 400 }] });
    fireEvent.touchEnd(details, { touches: [] });
    expect(calls.onBack).toHaveBeenCalledTimes(1);
    expect((panel as HTMLElement).style.transform).toBe("");
    fireEvent.pointerDown(bar, { clientX: 100, clientY: 80, pointerId: 3, pointerType: "touch" });
    fireEvent.pointerMove(panel, { clientX: 100, clientY: 140, pointerId: 3, pointerType: "touch" });
    fireEvent.pointerUp(panel, { clientX: 100, clientY: 180, pointerId: 3, pointerType: "touch" });
    expect(calls.onBack).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("raised: a third tap on the chosen card dives (close + centre on screen, no zoom)", () => {
    const { calls, unmount } = carousel({ raised: true });
    fireEvent.click(cardsIn()[0]);
    expect(calls.onDive).toHaveBeenCalledWith("a");
    expect(calls.onRaise).not.toHaveBeenCalled();
    unmount();
  });

  describe("the Explore panel under the carousel", () => {
    const view = { centre: ORIGIN, user: null };
    const apiRef = { current: { view: () => view, onView: () => () => {} } };
    const base = { markers: pins.filter((m) => m.type !== "idea"), sources: { contributors: [], places: [], events: [] }, apiRef, selectedId: null, onOpen: vi.fn(), onSeeAll: vi.fn() };
    const mode = () => document.querySelector("[data-mv2='explore']")!.getAttribute("data-mode");

    it("rests while the carousel is up, and its crown then goes straight back to the map's rest", () => {
      const onLevelReset = vi.fn();
      const onMode = vi.fn();
      const { rerender } = render(React.createElement(X.Explore, { ...base, onMode }));
      fireEvent.click(screen.getByRole("button", { name: P().open }));
      expect(mode()).toBe("strip");
      rerender(React.createElement(X.Explore, { ...base, onMode, peek: true, level: 1, onLevelReset }));
      expect(mode()).toBe("rest");
      expect(onMode).toHaveBeenLastCalledWith("rest");
      const crown = document.querySelector<HTMLButtonElement>("[data-mv2='explore-crown']")!;
      expect(crown.getAttribute("aria-label")).toBe(P().home);
      fireEvent.click(crown);
      expect(onLevelReset).toHaveBeenCalledTimes(1);
      // the panel's own look comes back as it was once the carousel is gone
      rerender(React.createElement(X.Explore, { ...base, onMode, peek: false, level: 0, onLevelReset }));
      expect(mode()).toBe("rest");
    });

    it("a tap on empty map (restSignal) folds the Where to… strip back to the crown alone", () => {
      const { rerender } = render(React.createElement(X.Explore, { ...base, restSignal: 0 }));
      fireEvent.click(screen.getByRole("button", { name: P().open }));
      expect(mode()).toBe("strip");
      rerender(React.createElement(X.Explore, { ...base, restSignal: 1 }));
      expect(mode()).toBe("rest");
    });

    // A finger on the panel is read from touch events (founder, 2026-11-25): native scrolling cancels pointer drags.
    const finger = (el: Element, x: number, ys: number[], dx = 0) => {
      fireEvent.touchStart(el, { touches: [{ clientX: x, clientY: ys[0] }] });
      ys.slice(1).forEach((y, i) => fireEvent.touchMove(el, { touches: [{ clientX: x + (dx * (i + 1)) / (ys.length - 1), clientY: y }] }));
      fireEvent.touchEnd(el, { touches: [] });
    };
    it("a vertical swipe on the strip content raises the panel; a short tap on a tile does not", () => {
      render(React.createElement(X.Explore, { ...base }));
      fireEvent.click(screen.getByRole("button", { name: P().open }));
      expect(mode()).toBe("strip");
      const tile = document.querySelector("[data-mv2='explore-tile']")!;
      // short press: not a raise
      finger(tile, 120, [500, 502]);
      expect(mode()).toBe("strip");
      // a sideways swipe belongs to the tiles
      finger(tile, 120, [520, 518, 516], -120);
      expect(mode()).toBe("strip");
      // vertical swipe up on the tiles raises
      finger(tile, 120, [520, 480, 440]);
      expect(mode()).toBe("open");
    });

    it("open at scroll-top: a continued downward swipe lowers (does not stick / reload)", () => {
      render(React.createElement(X.Explore, { ...base }));
      fireEvent.click(screen.getByRole("button", { name: P().open }));
      const tile = document.querySelector("[data-mv2='explore-tile']")!;
      finger(tile, 120, [520, 480, 440]);
      expect(mode()).toBe("open");
      // The open panel's rows scroll natively, which cancels pointer drags on a phone, so a finger pull there is read
      // from touch events (founder, 2026-11-25): down from the top of the rows drags the panel and lowers it.
      const scroller = document.querySelector("[data-mv2='explore-scroll']") as HTMLElement;
      let top = 40;
      Object.defineProperty(scroller, "scrollTop", { configurable: true, get: () => top });
      const pull = () => {
        fireEvent.touchStart(scroller, { touches: [{ clientX: 120, clientY: 200 }] });
        for (const y of [230, 260, 320]) fireEvent.touchMove(scroller, { touches: [{ clientX: 120, clientY: y }] });
        fireEvent.touchEnd(scroller, { touches: [] });
      };
      // rows scrolled down: the pull is the rows' own scroll, and the panel stays open
      pull();
      expect(mode()).toBe("open");
      top = 0;
      pull();
      expect(mode()).toBe("strip");
    });

    it("focus (Where-to): a vertical swipe up still raises to see the rest", () => {
      const { rerender } = render(React.createElement(X.Explore, { ...base }));
      fireEvent.click(screen.getByRole("button", { name: P().open }));
      expect(mode()).toBe("strip");
      rerender(React.createElement(X.Explore, { ...base, focus: { kind: "tile", id: "coffee" } }));
      expect(mode()).toBe("focus");
      const panel = document.querySelector("[data-mv2='explore']")!;
      finger(panel, 120, [520, 480, 440]);
      expect(mode()).toBe("open");
      // and down from the open panel's top, then down again from the focus, minimizes it with the filter kept
      finger(panel, 120, [200, 260, 330]);
      expect(mode()).toBe("focus");
      finger(panel, 120, [200, 260, 330]);
      expect(mode()).toBe("rest");
    });

    it("the desktop crown resets the levels too, and only folds the nav at the map's rest", () => {
      const onLevelReset = vi.fn();
      const { rerender } = render(React.createElement(X.Explore, { ...base, level: 1, onLevelReset }));
      const crown = () => document.querySelector<HTMLButtonElement>("[data-mv2='desktop-crown']")!;
      expect(crown().getAttribute("aria-label")).toBe(P().home);
      fireEvent.click(crown());
      expect(onLevelReset).toHaveBeenCalledTimes(1);
      expect(crown().getAttribute("aria-expanded")).toBe("true");
      rerender(React.createElement(X.Explore, { ...base, level: 0, onLevelReset }));
      fireEvent.click(crown());
      expect(onLevelReset).toHaveBeenCalledTimes(1);
      expect(crown().getAttribute("aria-expanded")).toBe("false");
    });
  });

  it("wires the levels into the map screen: one history entry per level, the chips row, and the inline details", () => {
    const home = read("src/frontend/app/home.jsx");
    expect(home).toContain("useBackGuard(searchOpen,");
    expect(home).toContain("useBackGuard(!!peek, closePeek)");
    expect(home).toContain("useBackGuard(!!(peek && peek.raised), lowerPeek)");
    expect(home).toContain("React.createElement(X.PinCarousel");
    expect(home).toContain("inline: true");
    expect(home).toContain("'aria-label': XS.chipsLabel");
    expect(home).toContain("centreOnScreen");
    expect(home).not.toContain("zoomCloser");
    expect(home).toContain("lift: false");
    expect(home).toMatch(/if \(zNow <= TOWN_ZOOM\) return;/);
    expect(home).not.toMatch(/survey\([^)]*band:\s*true/);
    expect(read("src/frontend/app/map.jsx")).toContain("centreOnScreen(id)");
    const css = read("src/frontend/assets/map-v2.css");
    // the chips: one row that scrolls sideways (no column), and the carousel moves by transform only
    expect(css).toMatch(/\[data-mv2='home-filters-wrap'\]/);
    const chips = css.slice(css.search(/^\[data-mv2='home-filters'\] \{/m));
    expect(chips.slice(0, chips.indexOf("}"))).toMatch(/flex-direction: row;[\s\S]*overflow-x: auto;/);
    expect(home).toContain("stripSignal");
    expect(home).toContain("closeSearch");
    expect(css).toMatch(/\[data-mv2='pinpeek'\] \{[^}]*transform: translateY\(calc\(100% - var\(--pp-peek\)\)\);/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\[data-mv2='pinpeek'\] \{\s*transition: none;\s*animation: none;/);
    // pinpeek handle must not inherit sheet handle's width:100% (that covered Close/Back)
    expect(css).toMatch(
      /\[data-mv2='pinpeek-bar'\] \[data-mv2='handle'\] \{[^}]*width: auto;/,
    );
    // lowered peek: crown above pinpeek; raised peek: explore-host under pinpeek
    expect(css).toContain(
      ":has([data-mv2='pinpeek']:not([hidden]):not([data-raised])) [data-mv2='explore-crown']",
    );
    expect(css).toContain(
      ":has([data-mv2='pinpeek'][data-raised]:not([hidden])) [data-mv2='explore-host']",
    );
    const store = read("src/frontend/app/store.jsx");
    // closing several levels at once takes all their entries off in ONE step
    expect(store).toContain("window.history.go(-k)");
  });
});
