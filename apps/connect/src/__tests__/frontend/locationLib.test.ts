/**
 * Where a listing really is (`src/frontend/app/location-lib.jsx`, QA 2026-11-25, CCQA-0009).
 *
 * One published event named a Pretoria venue but its pin was the geocoder's first hit near Durban, 522 km away, and its
 * Directions sent people there. These tests pin down the three promises of the file: a far geocoder hit is never placed
 * on its own, a far pin is called doubtful wherever it came from, and Directions never send anyone to a doubtful pin.
 * Fixtures are neutral, public-geography names only.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFrontend } from "./support/loadFrontend";

type Pt = { lat: number; lng: number };
type Cand = Pt & { label?: string; relevance?: number };
type Trust = { level: "none" | "outside" | "far" | "ok"; km?: number; city?: string };
type Choice = { status: "ok" | "confirm" | "none"; best?: Cand; anchor?: string | null };
type Api = {
  CITIES: { name: string; lat: number; lng: number }[];
  FAR_KM: number;
  NEAR_KM: number;
  haversineKm: (a: Pt, b: Pt) => number;
  cityNamed: (t: string) => { name: string } | null;
  pinTrust: (it: unknown) => Trust;
  needsCheck: (it: unknown) => boolean;
  describeTrust: (t: Trust) => string;
  directionsFor: (it: unknown) => { url: string; by: "pin" | "address" | "none" };
  chooseCandidate: (q: string, c: Cand[], o?: { near?: Pt | null }) => Choice;
  resolveLocation: (q: string, o?: { near?: Pt | null; fetch?: unknown }) => Promise<Choice>;
};

const PRETORIA_EAST: Pt = { lat: -25.7845, lng: 28.3155 };
const DURBAN_NORTH: Pt = { lat: -29.7128, lng: 31.0679 };
const JOHANNESBURG: Pt = { lat: -26.2041, lng: 28.0473 };
const HARTBEESPOORT: Pt = { lat: -25.747, lng: 27.8587 };

let L: Api;
let win: Record<string, unknown>;
beforeAll(() => {
  win = { __CC_ENV: { MAPTILER_KEY: "test-key" } };
  L = loadFrontend("location-lib.jsx", win).CCLocation as Api;
});

describe("cityNamed", () => {
  it("takes the LAST city an address names, ignoring case and punctuation", () => {
    expect(L.cityNamed("Woodlands Mall, Olympus, Pretoria")?.name).toBe("Pretoria");
    expect(L.cityNamed("12 Durban Road, PRETORIA, 0081")?.name).toBe("Pretoria");
    expect(L.cityNamed("Rietvallei 377-jr, City of Tshwane")?.name).toBe("Pretoria");
    expect(L.cityNamed("5 Bree Street, Cape Town City Centre")?.name).toBe("Cape Town");
  });
  it("matches whole words only, and says null when no city is named", () => {
    expect(L.cityNamed("Pretoriastraat, Some Town")).toBeNull();
    expect(L.cityNamed("Online")).toBeNull();
    expect(L.cityNamed("")).toBeNull();
  });
});

describe("pinTrust", () => {
  it("calls the QA's case far: a Pretoria address with a pin near Durban", () => {
    const t = L.pinTrust({ ...DURBAN_NORTH, location: "Woodlands Mall, Olympus, Pretoria" });
    expect(t.level).toBe("far");
    expect(t.city).toBe("Pretoria");
    expect(t.km).toBeGreaterThan(500);
    expect(L.describeTrust(t)).toBe(`The pin is ${t.km} km from Pretoria, which the address names.`);
  });
  it("trusts a metro's outskirts and a pin whose text names no city", () => {
    expect(L.pinTrust({ ...HARTBEESPOORT, location: "Kayaking, Hartebeespoort dam, Pretoria" }).level).toBe("ok");
    expect(L.pinTrust({ ...PRETORIA_EAST, address: "Some venue" }).level).toBe("ok");
  });
  it("separates no pin and a pin outside the country", () => {
    expect(L.pinTrust({ location: "Somewhere, Pretoria" }).level).toBe("none");
    expect(L.pinTrust({ lat: 51.5, lng: -0.12, location: "Pretoria" }).level).toBe("outside");
  });
  it("puts Pretoria and Johannesburg about 55 km apart (inside FAR_KM by design)", () => {
    const km = L.haversineKm(L.CITIES[0], JOHANNESBURG);
    expect(km).toBeGreaterThan(50);
    expect(km).toBeLessThan(60);
    expect(km).toBeLessThan(L.FAR_KM);
  });
});

describe("needsCheck (the admin's Pins to check list)", () => {
  it("lists far and outside pins, and an address with no pin", () => {
    expect(L.needsCheck({ ...DURBAN_NORTH, location: "Mall, Pretoria" })).toBe(true);
    expect(L.needsCheck({ location: "Cnr of 18 Ave, Pretoria" })).toBe(true);
  });
  it("leaves out good pins, empty listings and Contributors with no fixed place", () => {
    expect(L.needsCheck({ ...PRETORIA_EAST, location: "Hall, Pretoria" })).toBe(false);
    expect(L.needsCheck({ location: "" })).toBe(false);
    expect(L.needsCheck({ location: "Serving Pretoria", noFixedLocation: true })).toBe(false);
  });
});

describe("directionsFor", () => {
  const PIN_URL = "https://www.google.com/maps/dir/?api=1&destination=";
  it("sends a trusted pin as coordinates", () => {
    const d = L.directionsFor({ ...PRETORIA_EAST, location: "Hall, Pretoria" });
    expect(d.by).toBe("pin");
    expect(d.url).toBe(PIN_URL + encodeURIComponent(PRETORIA_EAST.lat + "," + PRETORIA_EAST.lng));
  });
  it("never sends a doubtful pin: the address text goes instead", () => {
    const d = L.directionsFor({ ...DURBAN_NORTH, location: "Woodlands Mall, Olympus, Pretoria" });
    expect(d.by).toBe("address");
    expect(d.url).toBe(PIN_URL + encodeURIComponent("Woodlands Mall, Olympus, Pretoria"));
    expect(d.url).not.toContain("31.06");
  });
  it("uses the address when there is no pin, and nothing when there are neither", () => {
    expect(L.directionsFor({ location: "Cnr 18 Ave, Pretoria" }).by).toBe("address");
    expect(L.directionsFor({}).url).toBe("");
    expect(L.directionsFor(null).url).toBe("");
  });
  it("gives no Directions to a Contributor with no fixed place", () => {
    expect(L.directionsFor({ ...PRETORIA_EAST, location: "Serving Pretoria", noFixedLocation: true }).url).toBe("");
  });
});

describe("chooseCandidate", () => {
  const far: Cand = { ...DURBAN_NORTH, label: "Woodlands, Durban", relevance: 0.95 };
  const near: Cand = { ...PRETORIA_EAST, label: "Woodlands, Pretoria", relevance: 0.7 };
  it("asks for confirmation when the only hit is far from the named city", () => {
    const c = L.chooseCandidate("Woodlands Mall, Olympus, Pretoria", [far]);
    expect(c.status).toBe("confirm");
    expect(c.anchor).toBe("Pretoria");
  });
  it("takes a close hit over the geocoder's first, far one", () => {
    const c = L.chooseCandidate("Woodlands Mall, Olympus, Pretoria", [far, near]);
    expect(c.status).toBe("ok");
    expect(c.best).toEqual(near);
  });
  it("does not accept a close hit the geocoder itself doubts", () => {
    const c = L.chooseCandidate("Hall, Pretoria", [{ ...PRETORIA_EAST, relevance: 0.3 }]);
    expect(c.status).toBe("confirm");
  });
  it("anchors on the place being looked at when the text names no city", () => {
    expect(L.chooseCandidate("Grace Hall", [{ ...PRETORIA_EAST, relevance: 0.9 }], { near: L.CITIES[0] }).status).toBe("ok");
    expect(L.chooseCandidate("Grace Hall", [{ ...DURBAN_NORTH, relevance: 0.9 }], { near: L.CITIES[0] }).status).toBe("confirm");
  });
  it("with no anchor at all, accepts only a hit the geocoder is sure of", () => {
    expect(L.chooseCandidate("Grace Hall", [{ ...PRETORIA_EAST, relevance: 0.9 }]).status).toBe("ok");
    expect(L.chooseCandidate("Grace Hall", [{ ...PRETORIA_EAST, relevance: 0.5 }]).status).toBe("confirm");
  });
  it("treats a missing score as unknown: a hit near the named city passes, a far one or an unanchored one does not", () => {
    expect(L.chooseCandidate("Church Square, Pretoria", [{ ...PRETORIA_EAST }]).status).toBe("ok");
    expect(L.chooseCandidate("Church Square, Pretoria", [{ ...DURBAN_NORTH }]).status).toBe("confirm");
    expect(L.chooseCandidate("Grace Hall", [{ ...PRETORIA_EAST }]).status).toBe("confirm");
  });
  it("drops hits outside South Africa and says none when nothing is left", () => {
    expect(L.chooseCandidate("Hall, Pretoria", [{ lat: 51.5, lng: -0.1, relevance: 1 }]).status).toBe("none");
    expect(L.chooseCandidate("Hall, Pretoria", []).status).toBe("none");
  });
});

describe("resolveLocation", () => {
  const answer = (features: unknown[], ok = true) => {
    const calls: string[] = [];
    const fetch = async (url: string) => {
      calls.push(url);
      return { ok, json: async () => ({ features }) };
    };
    return { calls, fetch };
  };
  it("asks for five South African candidates near the named city, and sends only the typed text", async () => {
    const { calls, fetch } = answer([{ center: [DURBAN_NORTH.lng, DURBAN_NORTH.lat], relevance: 1, place_name: "Woodlands, Durban" }]);
    const r = await L.resolveLocation("Woodlands Mall, Olympus, Pretoria", { fetch });
    expect(r.status).toBe("confirm");
    expect(calls).toHaveLength(1);
    const u = new URL(calls[0]);
    expect(u.origin + u.pathname).toBe("https://api.maptiler.com/geocoding/" + encodeURIComponent("Woodlands Mall, Olympus, Pretoria") + ".json");
    expect(u.searchParams.get("limit")).toBe("5");
    expect(u.searchParams.get("country")).toBe("za");
    expect(u.searchParams.get("proximity")).toBe(`${L.CITIES[0].lng},${L.CITIES[0].lat}`);
    expect([...u.searchParams.keys()].sort()).toEqual(["country", "key", "limit", "proximity"]);
  });
  it("places a confident nearby hit", async () => {
    const { fetch } = answer([{ center: [PRETORIA_EAST.lng, PRETORIA_EAST.lat], relevance: 0.9 }]);
    const r = await L.resolveLocation("Hall, Pretoria", { fetch });
    expect(r.status).toBe("ok");
    expect(r.best?.lat).toBeCloseTo(PRETORIA_EAST.lat);
  });
  it("never throws: a failed request, a bad body or no key is 'none'", async () => {
    expect((await L.resolveLocation("Hall, Pretoria", { fetch: answer([], false).fetch })).status).toBe("none");
    const broken = async () => ({ ok: true, json: async () => { throw new Error("bad"); } });
    expect((await L.resolveLocation("Hall, Pretoria", { fetch: broken })).status).toBe("none");
    const noKey = loadFrontend("location-lib.jsx", {}).CCLocation as Api;
    expect((await noKey.resolveLocation("Hall, Pretoria", { fetch: answer([]).fetch })).status).toBe("none");
    expect((await L.resolveLocation("   ", { fetch: answer([]).fetch })).status).toBe("none");
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("loads before store.jsx and connect-chrome.jsx in dev and in the production bundle", () => {
    const html = read("src/frontend/index.html");
    const build = read("scripts/build-frontend.js");
    for (const f of ["store.jsx", "connect-chrome.jsx", "map.jsx", "map-v2-sheet.jsx"]) {
      expect(html.indexOf('src="app/location-lib.jsx')).toBeGreaterThan(-1);
      expect(html.indexOf('src="app/location-lib.jsx')).toBeLessThan(html.indexOf('src="app/' + f));
      expect(build.indexOf("'location-lib.jsx'")).toBeGreaterThan(-1);
      expect(build.indexOf("'location-lib.jsx'")).toBeLessThan(build.indexOf(`'${f}'`));
    }
  });
  it("every geocode and every Directions link goes through it", () => {
    const store = read("src/frontend/app/store.jsx");
    expect(store).not.toMatch(/api\.maptiler\.com\/geocoding\/' \+ encodeURIComponent/);
    expect(store).toContain("window.CCLocation.resolveLocation(");
    for (const f of ["map-v2-sheet.jsx", "connect-previews.jsx"]) {
      const src = read("src/frontend/app/" + f);
      expect(src).toContain("CCLocation.directionsFor(");
      expect(src).not.toContain("openstreetmap.org/?mlat");
    }
    expect(read("src/frontend/app/create.jsx")).toContain("confirmMode: true");
  });
});
