/**
 * Explore, pulled in over the map (founder's design, 2026-11-26; `src/frontend/app/connect-explore.jsx`). The pure
 * helpers behind its cards and previews: the label line, the line under a title, the facts a preview lists (only fields
 * we store), one gold main action per kind with at most three quiet ones, the fair daily order that keeps no listing at
 * the front for its size or age, and the sorts. The page itself, the swipe and the preview are in e2e/explore-surface.spec.ts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadFrontend } from "./support/loadFrontend";

type Item = Record<string, unknown> & { id: string; type: string };
type Api = {
  areaOf: (l: string) => string;
  kindLabel: (i: Item) => string;
  metaLine: (i: Item, T?: unknown) => string;
  factsOf: (i: Item, T?: unknown) => [string, string][];
  actionsOf: (i: Item) => { primary: string; quiet: string[] };
  fairTurn: (id: string, day: number) => number;
  upcoming: (list: Item[], from: number, to: number) => Item[];
  sortItems: (list: Item[], sort: string, ctx: unknown) => Item[];
  pillMatches: (pill: string, i: Item) => boolean;
  ideasFrom: (app: unknown) => Item[];
  matchesQuery: (i: Item, q: string) => boolean;
};
let X: Api;
const T = { dateLine: (iso: string) => "D(" + iso.slice(0, 10) + ")" };
const L = {
  haversineKm: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot(a.lat - b.lat, a.lng - b.lng) * 111,
};

beforeAll(() => {
  const DATA = {
    getItemCategory: (i: Item) => ({ "worship-prayer": { name: "Worship & Prayer" }, "hospitality-cafes": { name: "Hospitality & Cafés" } } as Record<string, { name: string }>)[String(i.category)] || null,
  };
  X = loadFrontend("connect-explore.jsx", { DATA }).ConnectExplore as Api;
});

const ev = (over: Partial<Item> = {}): Item => ({ id: "e1", type: "event", title: "Prayer walk", category: "worship-prayer", location: "1 Main Road, Lynnwood, Pretoria", startsAt: "2026-11-28T07:30:00Z", host: "A host", connectCount: 0, ...over });
const place = (over: Partial<Item> = {}): Item => ({ id: "p1", type: "place", title: "A cafe", category: "hospitality-cafes", location: "2 Side Street, Hatfield, Pretoria", host: "A cafe", hours: "Mon–Sat 07:00–16:00", lat: -25.75, lng: 28.23, ...over });

describe("the words on a card", () => {
  it("takes the area from an address, the part before the city", () => {
    expect(X.areaOf("1186 Burnett Street, Hatfield, Pretoria")).toBe("Hatfield");
    expect(X.areaOf("Online")).toBe("Online");
    expect(X.areaOf("")).toBe("");
  });
  it("labels each kind with its category", () => {
    expect(X.kindLabel(ev())).toBe("Event · Worship & Prayer");
    expect(X.kindLabel(place())).toBe("Place · Hospitality & Cafés");
    expect(X.kindLabel({ id: "i", type: "idea", stage: "Gathering support" })).toBe("Kingdom Project · Gathering support");
    expect(X.kindLabel({ id: "c", type: "contributor", category: "nope" })).toBe("Contributor");
    expect(X.kindLabel({ id: "c", type: "contributor", kind: "ministry" })).toBe("Ministry");
    expect(X.kindLabel({ id: "c", type: "contributor", kind: "constructor" })).toBe("Contributor");
  });
  it("puts when and where under an event, where and who under a place, never the place's own name twice", () => {
    expect(X.metaLine(ev(), T)).toBe("D(2026-11-28) · Lynnwood");
    expect(X.metaLine(ev({ online: true }), T)).toBe("D(2026-11-28) · Online");
    expect(X.metaLine(place())).toBe("Hatfield");
    expect(X.metaLine(place({ host: "A team" }))).toBe("Hatfield · A team");
    expect(X.metaLine({ id: "i", type: "idea", votes: 12, threshold: 30, location: "" })).toBe("12 of 30 votes");
  });
});

describe("a preview's facts: only what the listing has", () => {
  it("an event: when, where, host, and how many are going once anyone is", () => {
    expect(X.factsOf(ev(), T)).toEqual([["When", "D(2026-11-28)"], ["Where", "1 Main Road, Lynnwood, Pretoria"], ["Hosted by", "A host"]]);
    expect(X.factsOf(ev({ connectCount: 14 }), T).pop()).toEqual(["Going", "14 connected"]);
  });
  it("a place: hours and address, and collaboration only when it is open to it", () => {
    expect(X.factsOf(place())).toEqual([["Hours", "Mon–Sat 07:00–16:00"], ["Address", "2 Side Street, Hatfield, Pretoria"]]);
    expect(X.factsOf(place({ openToCollaborate: true })).pop()).toEqual(["Collaboration", "Open to collaborate"]);
    expect(X.factsOf(place({ hours: "", location: "" }))).toEqual([]);
  });
});

describe("one gold main action per kind, at most three quiet ones", () => {
  it("event: Connect, then Directions (when it has a place), Consider, Share", () => {
    expect(X.actionsOf(ev())).toEqual({ primary: "connect", quiet: ["directions", "consider", "share"] });
    expect(X.actionsOf(ev({ online: true }))).toEqual({ primary: "connect", quiet: ["consider", "share"] });
  });
  it("place: Directions, then Follow, Save, Share; with no address Follow leads", () => {
    expect(X.actionsOf(place())).toEqual({ primary: "directions", quiet: ["follow", "save", "share"] });
    expect(X.actionsOf(place({ lat: null, location: "" }))).toEqual({ primary: "follow", quiet: ["save", "share"] });
  });
  it("contributor: Follow; a project: its board", () => {
    expect(X.actionsOf({ id: "c", type: "contributor", website: "https://example.org" })).toEqual({ primary: "follow", quiet: ["save", "share", "website"] });
    expect(X.actionsOf({ id: "i", type: "idea" })).toEqual({ primary: "project", quiet: [] });
  });
  it("never more than three quiet actions", () => {
    for (const i of [ev(), place(), { id: "c", type: "contributor", website: "x" }]) expect(X.actionsOf(i as Item).quiet.length).toBeLessThanOrEqual(3);
  });
});

describe("fair turns and sorting", () => {
  it("draws a stable order per day that changes from day to day", () => {
    expect(X.fairTurn("a", 1)).toBe(X.fairTurn("a", 1));
    const ids = Array.from({ length: 20 }, (_, i) => "id-" + i);
    const order = (d: number) => ids.slice().sort((a, b) => X.fairTurn(a, d) - X.fairTurn(b, d)).join();
    expect(order(1)).not.toBe(order(2));
  });
  it("upcoming: events overlapping the window, soonest first", () => {
    const from = Date.parse("2026-11-27T00:00:00Z");
    const to = Date.parse("2026-11-30T00:00:00Z");
    const list = [ev({ id: "b", startsAt: "2026-11-29T10:00:00Z" }), ev({ id: "a", startsAt: "2026-11-28T10:00:00Z" }), ev({ id: "x", startsAt: "2026-12-05T10:00:00Z" }), place()];
    expect(X.upcoming(list, from, to).map((i) => i.id)).toEqual(["a", "b"]);
  });
  it("nearest first measures from the city; recommended puts dated things first", () => {
    const ctx = { origin: { lat: -25.75, lng: 28.23 }, L, day: 1 };
    const far = place({ id: "far", lat: -25.9, lng: 28.3 });
    const near = place({ id: "near", lat: -25.751, lng: 28.231 });
    expect(X.sortItems([far, near], "near", ctx).map((i) => i.id)).toEqual(["near", "far"]);
    expect(X.sortItems([near, ev({ id: "e" })], "recommended", ctx)[0].id).toBe("e");
  });
  it("pills: All, Events, Kingdom Projects and the groups", () => {
    expect(X.pillMatches("all", place())).toBe(true);
    expect(X.pillMatches("events", ev())).toBe(true);
    expect(X.pillMatches("events", place())).toBe(false);
    expect(X.pillMatches("worship", { id: "w", type: "place", group: "worship" })).toBe(true);
    expect(X.pillMatches("ideas", { id: "i", type: "idea" })).toBe(true);
  });
  it("takes only Kingdom Projects that are open for votes", () => {
    const ideas = X.ideasFrom({ ideas: [{ id: "1", status: "voting", title: "A garden", votes: 3, threshold: 10 }, { id: "2", status: "done", title: "Old" }] });
    expect(ideas.map((i) => i.title)).toEqual(["A garden"]);
    expect(ideas[0]).toMatchObject({ type: "idea", group: "serve", votes: 3, threshold: 10 });
  });
  it("search matches the category's name as well as its id", () => {
    expect(X.matchesQuery(place(), "cafés hatfield")).toBe(true);
    expect(X.matchesQuery(place(), "worship")).toBe(false);
  });
});
