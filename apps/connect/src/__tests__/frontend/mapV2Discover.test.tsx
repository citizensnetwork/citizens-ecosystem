/**
 * Map v2 Discover page, issue #210 part 3 (`src/frontend/app/map-v2-discover.jsx`): the page "See all" and the nav's
 * Explore open.
 *
 * jsdom has no layout, so what is pinned here is the logic and the markup: which listings exist, Popular's points and
 * how it keeps the small in view (yes/no signals, one card per host, fair daily turns), the rows' order and the pills'
 * filter, the cards (the Explore row's own, with the group colour and km), a card tap opening the sheet over the page,
 * the scroll memory on the page's own history entry, and the route and stylesheet wiring. Real touch, snapping and
 * Back are in e2e/map-v2-discover.spec.ts.
 */
import React from "react";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Listing = { id: string; type: string; title: string; category?: string; lat: number; lng: number; organizerId?: string | null; startsAt?: string; isLive?: boolean };
type Ranked = { m: Listing; meters: number };
type Row = { id: string; group?: string; items: Ranked[] };
type DiscoverApi = {
  WINDOW_MS: number;
  CITY: { lat: number; lng: number };
  listingsOf: (src: Record<string, unknown[]>, now: number) => Listing[];
  activityOf: (listings: Listing[], news: unknown[], now: number) => Map<string, number>;
  fairTurn: (id: string, day: number) => number;
  popular: (ranked: Ranked[], points: Map<string, number>, now: number, cap: number) => Ranked[];
  rowsFor: (listings: Listing[], points: Map<string, number>, pill: string, origin: { lat: number; lng: number }, now: number) => Row[];
  Discover: React.ComponentType;
};
type ExploreApi = { ROW_CAP: number; GROUPS: string[]; lastView: () => { centre: unknown; user: unknown } };

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const load = (file: string) => new Function("window", "React", "document", read("src/frontend/app/" + file))(window, React, document);

let D: DiscoverApi;
let X: ExploreApi;
let S: { discover: Record<string, unknown> & { row: Record<string, unknown> }; explore: Record<string, unknown> & { groups: Record<string, string> } };

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 10, 8, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();
// Pretoria-ish: one degree of latitude is about 111 km.
const ORIGIN = { lat: -25.75, lng: 28.19 };
const at = (km: number) => ({ lat: ORIGIN.lat + km / 111.2, lng: ORIGIN.lng });

const contributor = (id: string, km: number, category = "churches-ministries") => ({ id, name: "Org " + id, category, ...at(km), coverPhoto: "" });
const place = (id: string, km: number, category = "hospitality-cafes") => ({ id, name: "Place " + id, category, ...at(km) });
const event = (id: string, km: number, inDays: number, organizerId: string | null, extra: Record<string, unknown> = {}) => ({
  id, title: "Event " + id, category: "kids", ...at(km), startsAt: iso(NOW + inDays * DAY), organizerId, ...extra,
});

beforeAll(() => {
  const w = window as unknown as Record<string, unknown>;
  w.Icon = function Icon({ name }: { name: string }) {
    return React.createElement("svg", { "data-icon": name });
  };
  w.UI = { safeUrl: (u: string) => (typeof u === "string" && u.startsWith("https://") ? u : "") };
  ["data.jsx", "map-v2-strings.jsx", "map-v2-card.jsx", "map-v2-row.jsx", "map-v2-nearby.jsx", "map-v2-explore.jsx", "map-v2-discover.jsx"].forEach(load);
  D = w.MapV2Discover as DiscoverApi;
  X = w.MapV2Explore as ExploreApi;
  S = w.MapV2Strings as typeof S;
});
afterEach(() => cleanup());

describe("listingsOf: what the page can show", () => {
  it("keeps events, places and Contributors with a position; drops finished events and anything without one", () => {
    const list = D.listingsOf({
      events: [event("soon", 1, 2, "c1"), event("done", 1, -3, "c1"), { ...event("nowhere", 1, 2, "c1"), lat: null }],
      places: [place("p1", 2)],
      contributors: [contributor("c1", 3), { ...contributor("online", 1), lat: null, lng: null }],
    }, NOW);
    expect(list.map((m) => m.type + ":" + m.id)).toEqual(["event:soon", "place:p1", "contributor:c1"]);
    expect(list[0]).toMatchObject({ organizerId: "c1", title: "Event soon" });
    expect(list[2]).toMatchObject({ title: "Org c1" });
  });
});

describe("Popular: points for what is going on, never for how much", () => {
  const listings = () => D.listingsOf({
    events: [
      event("e-big-1", 1, 3, "big"), event("e-big-2", 1, 4, "big"), event("e-big-3", 1, 5, "big"),
      event("e-small", 2, 10, "small"), event("e-far", 2, 45, "quiet"), event("e-live", 3, 0.01, null, { isLive: true }),
    ],
    places: [place("p1", 1)],
    contributors: [contributor("big", 1), contributor("small", 2), contributor("quiet", 2), contributor("writer", 4)],
  }, NOW);
  const news = [
    { contributorId: "writer", createdAt: iso(NOW - 5 * DAY) },
    { contributorId: "quiet", createdAt: iso(NOW - 60 * DAY) },   // too old
    { contributorId: "small", date: "2026-10-01" },               // no createdAt: the post date counts
  ];

  it("gives one point per signal: an event this month, news this month, live now", () => {
    const p = D.activityOf(listings(), news, NOW);
    expect(p.get("contributor:big")).toBe(1);       // three events: still one point
    expect(p.get("contributor:small")).toBe(2);     // one event and recent news
    expect(p.get("contributor:writer")).toBe(1);
    expect(p.get("contributor:quiet")).toBeUndefined(); // an event in 45 days and old news: nothing this month
    expect(p.get("event:e-small")).toBe(1);
    expect(p.get("event:e-far")).toBeUndefined();
    expect(p.get("event:e-live")).toBe(2);           // live and starting
    expect(p.get("place:p1")).toBeUndefined();       // no activity data for places
  });

  it("lists only listings with a point, most first, one card per host", () => {
    const list = listings();
    const ranked = list.map((m) => ({ m, meters: 0 }));
    const out = D.popular(ranked, D.activityOf(list, news, NOW), NOW, 20);
    const ids = out.map((r) => r.m.id);
    expect(ids.slice(0, 2).sort()).toEqual(["e-live", "small"]); // two points each, ahead of every one-point listing
    // "big" and its three events are one host: exactly one of them is in the row
    expect(ids.filter((id) => id === "big" || id.startsWith("e-big")).length).toBe(1);
    // "small" and its event are one host too
    expect(ids.filter((id) => id === "small" || id === "e-small").length).toBe(1);
    expect(ids).toContain("writer");
    expect(ids).not.toContain("quiet");
    expect(ids).not.toContain("p1");
    expect(D.popular(ranked, D.activityOf(list, news, NOW), NOW, 2).length).toBe(2);
  });

  it("orders equal scores in fair turns that change from day to day, not by name or size", () => {
    expect(D.fairTurn("contributor:a", 1)).toBe(D.fairTurn("contributor:a", 1));
    expect(D.fairTurn("contributor:a", 1)).not.toBe(D.fairTurn("contributor:a", 2));
    const many = Array.from({ length: 12 }, (_, i) => contributor("c" + String(i).padStart(2, "0"), 1));
    const evs = many.map((c, i) => event("e" + i, 1, 2, c.id));
    const list = D.listingsOf({ events: evs, places: [], contributors: many }, NOW);
    const ranked = list.filter((m) => m.type === "contributor").map((m) => ({ m, meters: 0 }));
    const order = (now: number) => D.popular(ranked, D.activityOf(list, [], now), now, 20).map((r) => r.m.id);
    const today = order(NOW);
    expect(today.length).toBe(12);
    expect(today).not.toEqual([...today].sort()); // not alphabetical
    const days = new Set([0, 1, 2, 3, 4].map((d) => order(NOW + d * DAY)[0]));
    expect(days.size).toBeGreaterThan(1);          // the front changes hands
  });
});

describe("rowsFor: Near you, Popular, then one row per group, and the pills filter them all", () => {
  const list = () => D.listingsOf({
    events: [event("kids-1", 4, 2, "c1")],
    places: [place("cafe", 2)],
    contributors: [contributor("c1", 1), contributor("c2", 3, "outreach-missions")],
  }, NOW);
  const pts = () => D.activityOf(list(), [], NOW);

  it("puts Near you first (closest first), Popular second, then the groups in their order; no empty row", () => {
    const rows = D.rowsFor(list(), pts(), "all", ORIGIN, NOW);
    expect(rows.map((r) => r.id)).toEqual(["near", "popular", "worship", "serve", "audiences", "business"]);
    expect(rows[0].items.map((r) => r.m.id)).toEqual(["c1", "cafe", "c2", "kids-1"]);
    expect(rows[0].items[0].meters).toBeGreaterThan(900);
    expect(rows.find((r) => r.id === "business")!.items.map((r) => r.m.id)).toEqual(["cafe"]);
    expect(rows.find((r) => r.id === "worship")!.group).toBe("worship");
    // nothing culture or learn: those rows are left out
    expect(rows.some((r) => r.id === "culture" || r.id === "learn")).toBe(false);
  });

  it("a group pill keeps Near you and Popular to that group, plus that group's row", () => {
    const rows = D.rowsFor(list(), pts(), "worship", ORIGIN, NOW);
    expect(rows.map((r) => r.id)).toEqual(["near", "popular", "worship"]);
    for (const r of rows) for (const it of r.items) expect(it.m.id).toBe("c1");
  });

  it("Events keeps events in every row", () => {
    const rows = D.rowsFor(list(), pts(), "events", ORIGIN, NOW);
    expect(rows.map((r) => r.id)).toEqual(["near", "popular", "audiences"]);
    for (const r of rows) for (const it of r.items) expect(it.m.type).toBe("event");
  });

  it("caps Near you and Popular at the Explore row's size; a group row keeps all (the row cuts it with See all)", () => {
    const many = Array.from({ length: 30 }, (_, i) => contributor("w" + i, i / 10));
    const l = D.listingsOf({ events: [], places: [], contributors: many }, NOW);
    const rows = D.rowsFor(l, new Map(), "all", ORIGIN, NOW);
    expect(rows.map((r) => r.id)).toEqual(["near", "worship"]); // nobody active: no Popular row
    expect(rows[0].items.length).toBe(X.ROW_CAP);
    expect(rows[1].items.length).toBe(30);
  });
});

describe("the page", () => {
  const go = vi.fn();
  const trackImpression = vi.fn();
  const data = () => ({
    events: [event("kids-1", 4, 2, "c1")],
    places: [place("cafe", 2)],
    contributors: [{ ...contributor("c1", 1), coverPhoto: "https://img.test/c1.jpg" }, contributor("c2", 3, "outreach-missions")],
    newsPosts: [],
  });
  const sheetProps = vi.fn();
  let realView: () => { centre: unknown; user: unknown };

  beforeEach(() => {
    const w = window as unknown as Record<string, unknown>;
    w.useApp = () => ({ ...data(), go, trackImpression, nav: { page: "explore", params: {} } });
    w.MapV2Sheet = function Sheet(props: Record<string, unknown>) {
      sheetProps(props);
      return React.createElement("div", { "data-mv2": "sheet" },
        React.createElement("button", { type: "button", onClick: props.onClose as () => void }, "close"));
    };
    w.AccountButton = function AccountButton() { return React.createElement("button", { type: "button" }, "account"); };
    realView = X.lastView;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    window.history.replaceState({ cc: 1, idx: 1, nav: { page: "explore", params: {} } }, "");
  });
  afterEach(() => {
    X.lastView = realView;
    vi.useRealTimers();
    sheetProps.mockClear();
    go.mockClear();
  });

  it("titles the page Explore, keeps the pills (no Ideas) with All on, and draws the rows in order", () => {
    render(React.createElement(D.Discover));
    expect(screen.getByRole("heading", { level: 1, name: S.discover.title as string })).toBeTruthy();
    const pills = screen.getByRole("group", { name: S.discover.pillsLabel as string });
    expect([...pills.querySelectorAll("[data-mv2='pill']")].map((p) => p.getAttribute("data-pill")))
      .toEqual(["all", "worship", "events", "business", "serve", "culture", "learn", "audiences"]);
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    const titles = [...document.querySelectorAll("[data-mv2='discover-row-title']")].map((t) => t.textContent);
    expect(titles).toEqual(["Near you", "Popular", "Churches & worship", "Serve & care", "Audiences", "Business"]);
    expect(screen.getByText(S.discover.popularHint as string)).toBeTruthy();
    // a group row carries its colour (the section's data-cat feeds the title's dot)
    const worship = document.querySelector("[data-mv2='discover-row'][data-row='worship']")!;
    expect(worship.getAttribute("data-cat")).toBe("worship");
    expect(worship.querySelector("[data-mv2='pill-dot']")).toBeTruthy();
  });

  it("draws the Explore row's own card: group colour on every card, distances in km, unique ids per row", () => {
    render(React.createElement(D.Discover));
    const cards = [...document.querySelectorAll("[data-mv2='explore-card'] [data-mv2='card2']")];
    expect(cards.length).toBeGreaterThan(4);
    for (const c of cards) expect(c.getAttribute("data-cat")).toMatch(/^(worship|serve|culture|learn|audiences|business)$/);
    // no position and no map yet: measured from the city centre, and said so
    expect(document.querySelector("[data-row='near'] [data-explore-id='c1']")!.textContent).toMatch(/km from the city centre|m from the city centre/);
    expect(document.body.textContent).not.toMatch(/\bmiles?\b|\bmi\b/);
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("measures from the person when the map knows where they are", () => {
    X.lastView = () => ({ centre: null, user: ORIGIN });
    render(React.createElement(D.Discover));
    expect(document.querySelector("[data-row='near'] [data-explore-id='c1']")!.textContent).toContain("1 km away");
  });

  it("a pill filters every row, gold-pressed, and remembers itself on this page's history entry", () => {
    render(React.createElement(D.Discover));
    fireEvent.click(screen.getByRole("button", { name: "Business" }));
    expect(screen.getByRole("button", { name: "Business" }).getAttribute("aria-pressed")).toBe("true");
    expect([...document.querySelectorAll("[data-mv2='discover-row']")].map((r) => r.getAttribute("data-row"))).toEqual(["near", "business"]);
    for (const c of document.querySelectorAll("[data-explore-id]")) expect(c.getAttribute("data-explore-id")).toBe("cafe");
    expect((window.history.state as Record<string, { pill: string }>).mv2discover.pill).toBe("business");
    // the store's own fields are untouched
    expect(window.history.state).toMatchObject({ cc: 1, idx: 1, nav: { page: "explore" } });
  });

  it("a card opens that listing's own page at once (founder, 2026-10-30), after writing where the page is so Back finds it as it was", () => {
    render(React.createElement(D.Discover));
    const open = (id: string) => fireEvent.click(document.querySelector(`[data-row='near'] [data-explore-id='${id}'] button`)!);
    open("kids-1");
    expect(go).toHaveBeenLastCalledWith("event", { id: "kids-1" });
    open("cafe");
    expect(go).toHaveBeenLastCalledWith("place", { id: "cafe" });
    open("c1");
    expect(go).toHaveBeenLastCalledWith("profile", { id: "c1" });
    // no summary sheet over the page, and no second impression (the event page counts its own)
    expect(sheetProps).not.toHaveBeenCalled();
    expect(document.querySelector("[data-mv2='sheet']")).toBeNull();
    expect(trackImpression).not.toHaveBeenCalled();
    expect((window.history.state as Record<string, unknown>).mv2discover).toBeTruthy();
  });

  it("coming Back restores the pill from this page's history entry; a fresh visit starts at All", () => {
    window.history.replaceState({ cc: 1, idx: 1, nav: { page: "explore", params: {} }, mv2discover: { pill: "serve", top: 0, rows: {} } }, "");
    render(React.createElement(D.Discover));
    expect(screen.getByRole("button", { name: "Serve & care" }).getAttribute("aria-pressed")).toBe("true");
    cleanup();
    window.history.replaceState({ cc: 1, idx: 2, nav: { page: "explore", params: {} } }, "");
    render(React.createElement(D.Discover));
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("never writes into another screen's entry or an overlay's", () => {
    window.history.replaceState({ cc: 1, idx: 3, nav: { page: "explore", params: {} }, guard: true }, "");
    render(React.createElement(D.Discover));
    fireEvent.click(screen.getByRole("button", { name: "Business" }));
    expect((window.history.state as Record<string, unknown>).mv2discover).toBeUndefined();
  });

  it("says so plainly when a pill leaves nothing", () => {
    (window as unknown as Record<string, unknown>).useApp = () => ({ events: [], places: [], contributors: [], newsPosts: [], go, nav: { page: "explore", params: {} } });
    render(React.createElement(D.Discover));
    expect(screen.getByText(S.discover.empty as string)).toBeTruthy();
  });
});

describe("wiring", () => {
  it("opens at /explore on Map v2's Discover page, and Kingdom Exploration keeps its own address", () => {
    const shell = read("src/frontend/app/shell.jsx");
    expect(shell).toContain("case 'explore': return React.createElement(window.MapV2Discover.Discover);");
    expect(shell).toContain("case 'kingdom-discovery': return React.createElement(window.KingdomDiscoveryPage);");
    expect(read("src/frontend/app/home.jsx")).toContain("onSeeAll: () => app.go('explore')");
  });

  it("registers the module after the nav and before the home screen, in the page and in the build", () => {
    const html = read("src/frontend/index.html");
    const build = read("scripts/build-frontend.js");
    expect(html).toContain('src="app/map-v2-discover.jsx?v=20261030a"');
    expect(html.indexOf("app/map-v2-nav.jsx")).toBeLessThan(html.indexOf("app/map-v2-discover.jsx"));
    expect(html.indexOf("app/map-v2-discover.jsx")).toBeLessThan(html.indexOf("app/home.jsx"));
    expect(build.indexOf("'map-v2-nav.jsx'")).toBeLessThan(build.indexOf("'map-v2-discover.jsx'"));
    expect(build.indexOf("'map-v2-discover.jsx'")).toBeLessThan(build.indexOf("'home.jsx'"));
  });

  it("styles: rows keep a vertical swipe for the page, the title bar sticks, the nav is cleared", () => {
    const css = read("src/frontend/assets/map-v2.css");
    expect(css).not.toMatch(/\[data-mv2='discover'\] \{[^}]*--mv2-ta-row/); // outside the sheet a row keeps the browser's own touch rule
    expect(css).toMatch(/\[data-mv2='discover'\] \[data-mv2='pills'\] \{\s*touch-action: pan-x pan-y;/);
    expect(css).toMatch(/\[data-mv2='discover-top'\] \{[^}]*position: sticky;/);
    // a full-screen page never takes a large backdrop blur (it is redrawn on every scroll frame)
    const block = (sel: string) => {
      const at = css.indexOf("\n" + sel + " {");
      expect(at, sel).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at));
    };
    for (const sel of ["[data-mv2='discover']", "[data-mv2='discover-top']", "[data-mv2='discover-scroll']"]) {
      expect(block(sel), sel).not.toContain("backdrop-filter");
    }
    expect(block("[data-mv2='discover-top']")).toContain("background: var(--surface-0);");
    // the Explore card's fixed height (two title lines, one-line chip and meta) is not scoped to the map's row, so the
    // same card here never changes height when a pill refills a row
    expect(block("[data-mv2='explore-card'] [data-mv2='row-title']")).toContain("min-height: calc(var(--lh-2) * 2);");
    expect(block("[data-mv2='explore-card'] [data-mv2='card-meta']")).toContain("white-space: nowrap;");
    expect(css).toMatch(/\[data-mv2='discover-scroll'\] \{[^}]*padding-bottom: calc\(var\(--nav-clear\)/);
    expect(css).toMatch(/\[data-mv2='discover'\]\[data-narrow\] \{\s*--nav-clear: var\(--nav-zone\);/);
  });
});
