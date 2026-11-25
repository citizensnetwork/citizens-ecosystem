/**
 * Explore's city scope and search matching (QA 2026-11-25, CCQA-0002/0003). Explore "Pretoria" returned 27 results, 15
 * in another city, and a search matched only the title, kind and description. The founder chose a 35 km radius
 * (Pretoria takes in Centurion and Midrand; Johannesburg, about 55 km away, stays out).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadFrontend } from "./support/loadFrontend";

type Pt = { lat: number; lng: number };
type Loc = { CITY_RADIUS_KM: number; CITIES: (Pt & { name: string })[]; cityScope: (i: unknown, c: unknown, r?: number) => string };
type Explore = { matchesQuery: (i: Record<string, string>, q: string) => boolean };
let L: Loc;
let X: Explore;
beforeAll(() => {
  L = loadFrontend("location-lib.jsx").CCLocation as Loc;
  X = loadFrontend("connect-explore.jsx").ConnectExplore as Explore;
});

const PRETORIA = () => L.CITIES.find((c) => c.name === "Pretoria")!;
const CENTURION: Pt = { lat: -25.8601, lng: 28.1891 };
const MIDRAND: Pt = { lat: -25.9992, lng: 28.1263 };
const JOBURG: Pt = { lat: -26.2041, lng: 28.0473 };

describe("cityScope", () => {
  it("uses the founder's 35 km", () => expect(L.CITY_RADIUS_KM).toBe(35));
  it("keeps Centurion and Midrand in Pretoria, and leaves Johannesburg out", () => {
    expect(L.cityScope(CENTURION, PRETORIA())).toBe("in");
    expect(L.cityScope(MIDRAND, PRETORIA())).toBe("in");
    expect(L.cityScope(JOBURG, PRETORIA())).toBe("out");
  });
  it("never drops a listing with no pin: it is 'nopin', shown in its own group", () => {
    expect(L.cityScope({ location: "Online" }, PRETORIA())).toBe("nopin");
  });
  it("with no city chosen, every pinned listing is in", () => {
    expect(L.cityScope(JOBURG, null)).toBe("in");
  });
});

describe("matchesQuery", () => {
  const item = { title: "Grace Café", groupLabel: "Culture & fun", group: "culture", category: "coffee-shops", detail: "Coffee and community", location: "12 Burnett Street, Hatfield, Pretoria", host: "A Fellowship" };
  it("matches where and who, not only the title", () => {
    expect(X.matchesQuery(item, "hatfield")).toBe(true);
    expect(X.matchesQuery(item, "fellowship")).toBe(true);
  });
  it("ignores case and accents", () => {
    expect(X.matchesQuery(item, "CAFE")).toBe(true);
    expect(X.matchesQuery({ ...item, title: "Grace Cafe" }, "café")).toBe(true);
  });
  it("needs every word to match", () => {
    expect(X.matchesQuery(item, "coffee hatfield")).toBe(true);
    expect(X.matchesQuery(item, "coffee soweto")).toBe(false);
  });
  it("an empty search matches everything", () => expect(X.matchesQuery(item, "  ")).toBe(true));
});
