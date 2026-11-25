/**
 * The server's geocoder rule (src/lib/location/placeCheck.ts) and the browser's (src/frontend/app/location-lib.jsx) are
 * two copies of one rule: a form, the intake and the listing helper must place (or refuse) the same address the same
 * way. This runs both on the same cases.
 */
import { describe, it, expect } from "vitest";
import { CITIES, chooseCandidate, cityNamed, haversineKm, type Candidate, type Point } from "@/lib/location/placeCheck";
import { loadFrontend } from "../frontend/support/loadFrontend";

type Browser = {
  CITIES: { name: string; lat: number; lng: number; aliases: string[] }[];
  cityNamed: (t: string) => { name: string } | null;
  haversineKm: (a: Point, b: Point) => number;
  chooseCandidate: (q: string, c: Candidate[], o?: { near?: Point | null }) => { status: string; best?: Candidate };
};
const B = loadFrontend("location-lib.jsx").CCLocation as Browser;

const PTA_EAST = { lat: -25.7845, lng: 28.3155 };
const DURBAN_N = { lat: -29.7128, lng: 31.0679 };
const CASES: [string, Candidate[], Point | null][] = [
  ["Woodlands Mall, Olympus, Pretoria", [{ ...DURBAN_N, relevance: 1 }], null],
  ["Woodlands Mall, Olympus, Pretoria", [{ ...DURBAN_N, relevance: 1 }, { ...PTA_EAST, relevance: 0.7 }], null],
  ["Hall, Pretoria", [{ ...PTA_EAST, relevance: 0.3 }], null],
  ["Grace Hall", [{ ...PTA_EAST, relevance: 0.9 }], null],
  ["Grace Hall", [{ ...PTA_EAST, relevance: 0.5 }], null],
  ["Grace Hall", [{ ...DURBAN_N, relevance: 0.9 }], CITIES[0]],
  ["18 Oak Avenue, Randburg, Johannesburg", [{ lat: -26.1, lng: 28.0, relevance: 0.9 }], null],
  ["Hall, Pretoria", [{ lat: 51.5, lng: -0.1, relevance: 1 }], null],
  ["Hall, Pretoria", [], null],
];

describe("placeCheck.ts and location-lib.jsx agree", () => {
  it("on the city list", () => {
    expect(B.CITIES).toEqual(CITIES.map((c) => ({ ...c, aliases: [...c.aliases] })));
  });
  it.each(CASES)("on %s", (q, cands, near) => {
    const server = chooseCandidate(q, cands, near);
    const browser = B.chooseCandidate(q, cands, { near });
    expect(server.status).toBe(browser.status);
    expect(server.best ?? null).toEqual(browser.best ?? null);
    expect(cityNamed(q)?.name ?? null).toBe(B.cityNamed(q)?.name ?? null);
  });
  it("on distance", () => {
    expect(haversineKm(PTA_EAST, DURBAN_N)).toBeCloseTo(B.haversineKm(PTA_EAST, DURBAN_N), 6);
  });
});
