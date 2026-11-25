/**
 * The server's copy of the geocoder rule in `src/frontend/app/location-lib.jsx` (QA 2026-11-25, CCQA-0009).
 *
 * A first geocoder hit once put a Pretoria venue near Durban. A typed address is placed on its own only when a hit is
 * close to the city the text names (or, naming none, when the geocoder is sure of it); otherwise the caller gets no pin
 * and records a warning, and the listing shows up in the admin's "Pins to check". The browser file cannot be imported
 * here (it is a window-wired script), so `placeCheckParity.test.ts` runs both on the same cases: change them together.
 */

export type Point = { lat: number; lng: number };
export type Candidate = Point & { label?: string; relevance?: number };
export type Choice = { status: "ok" | "confirm" | "none"; best?: Candidate };

type City = Point & { name: string; aliases: string[] };

export const CITIES: readonly City[] = [
  { name: "Pretoria", lat: -25.7479, lng: 28.2293, aliases: ["tshwane", "centurion"] },
  { name: "Johannesburg", lat: -26.2041, lng: 28.0473, aliases: ["joburg", "jozi", "sandton", "soweto", "randburg", "roodepoort"] },
  { name: "Cape Town", lat: -33.9249, lng: 18.4241, aliases: ["bellville", "stellenbosch", "khayelitsha", "mitchells plain"] },
  { name: "Durban", lat: -29.8587, lng: 31.0218, aliases: ["ethekwini", "pinetown", "umhlanga", "umlazi"] },
  { name: "Gqeberha", lat: -33.9608, lng: 25.6022, aliases: ["port elizabeth", "nelson mandela bay"] },
  { name: "Bloemfontein", lat: -29.0852, lng: 26.1596, aliases: ["mangaung"] },
];
const SA = { south: -35, north: -22, west: 16, east: 33 };
export const NEAR_KM = 60;
const MIN_RELEVANCE = 0.6;
const MIN_RELEVANCE_UNANCHORED = 0.8;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function haversineKm(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const s = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

const inSouthAfrica = (p: Point) => p.lat >= SA.south && p.lat <= SA.north && p.lng >= SA.west && p.lng <= SA.east;

function fold(text: string): string {
  const t = String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return ` ${t} `;
}

/** The city an address names: the one mentioned last. null when it names none. */
export function cityNamed(text: string): City | null {
  const t = fold(text);
  let best: City | null = null;
  let bestAt = -1;
  for (const c of CITIES) {
    for (const n of [c.name, ...c.aliases]) {
      const at = t.lastIndexOf(` ${fold(n).trim()} `);
      if (at > bestAt) {
        bestAt = at;
        best = c;
      }
    }
  }
  return best;
}

/** Choose among geocoder candidates (in the geocoder's order). Same rule as the browser's chooseCandidate. */
export function chooseCandidate(query: string, candidates: Candidate[], near?: Point | null): Choice {
  const list = candidates.filter((c) => isNum(c.lat) && isNum(c.lng) && inSouthAfrica(c));
  if (!list.length) return { status: "none" };
  const named = cityNamed(query);
  const anchor: Point | null = named ?? (near && isNum(near.lat) && isNum(near.lng) ? near : null);
  const rel = (c: Candidate) => (isNum(c.relevance) ? c.relevance : 0);
  if (anchor) {
    const min = named ? MIN_RELEVANCE : MIN_RELEVANCE_UNANCHORED;
    const close = list.filter((c) => haversineKm(c, anchor) <= NEAR_KM && rel(c) >= min);
    if (close.length) return { status: "ok", best: [...close].sort((a, b) => rel(b) - rel(a))[0] };
    return { status: "confirm", best: [...list].sort((a, b) => haversineKm(a, anchor) - haversineKm(b, anchor))[0] };
  }
  return { status: rel(list[0]) >= MIN_RELEVANCE_UNANCHORED ? "ok" : "confirm", best: list[0] };
}
