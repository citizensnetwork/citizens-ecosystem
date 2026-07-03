/**
 * Short city-code label for SA cities, used on event/place tiles so users
 * can scan results geographically at a glance.
 *
 * Resolution order:
 *   1. Match a known city name (or common abbreviation) in the free-text
 *      `location` / `address` string.
 *   2. Fall back to a coarse lat/lng radius around each city centre.
 *   3. Return `null` if neither resolves — caller can omit the chip.
 */

export type CityCode =
  | "PTA"
  | "JHB"
  | "CT"
  | "DBN"
  | "PE"
  | "BFN"
  | "ELS"
  | "PMB"
  | "POL"
  | "GRG"
  | "STB"
  | "RBT"
  | "KIM";

interface CityDef {
  code: CityCode;
  /** Case-insensitive names/aliases to look for in the location string. */
  names: readonly string[];
  /** Approximate city centre (lat, lng). */
  center: readonly [number, number];
}

const CITIES: readonly CityDef[] = [
  { code: "PTA", names: ["pretoria", "tshwane", "pta", "centurion", "midrand"], center: [-25.7479, 28.2293] },
  { code: "JHB", names: ["johannesburg", "joburg", "jhb", "sandton", "soweto", "randburg", "roodepoort", "germiston", "boksburg", "kempton park", "edenvale", "fourways"], center: [-26.2041, 28.0473] },
  { code: "CT",  names: ["cape town", "kaapstad", "cpt", "claremont", "bellville", "table view"], center: [-33.9249, 18.4241] },
  { code: "STB", names: ["stellenbosch"], center: [-33.9321, 18.8602] },
  { code: "DBN", names: ["durban", "ethekwini", "dbn", "umhlanga", "pinetown"], center: [-29.8587, 31.0218] },
  { code: "PMB", names: ["pietermaritzburg", "pmb", "msunduzi"], center: [-29.6006, 30.3794] },
  { code: "PE",  names: ["port elizabeth", "gqeberha", "p.e.", " pe ", "p elizabeth"], center: [-33.9608, 25.6022] },
  { code: "ELS", names: ["east london", "buffalo city"], center: [-33.0153, 27.9116] },
  { code: "BFN", names: ["bloemfontein", "mangaung", "bfn"], center: [-29.0852, 26.1596] },
  { code: "POL", names: ["polokwane", "pietersburg"], center: [-23.9045, 29.4689] },
  { code: "GRG", names: ["george"], center: [-33.9628, 22.4612] },
  { code: "RBT", names: ["rustenburg"], center: [-25.6672, 27.2424] },
  { code: "KIM", names: ["kimberley"], center: [-28.7282, 24.7499] },
];

/** Pad-search helper so " pe " doesn't match "type" but matches " in PE ". */
function paddedHaystack(s: string): string {
  return ` ${s.toLowerCase()} `;
}

function distanceKm(a: readonly [number, number], b: readonly [number, number]): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Coarse radius (km) for "this latlng is in city X". */
const CITY_RADIUS_KM = 40;

/**
 * Return a short city code for the given location, or `null` if no
 * confident match. Text takes priority over coordinates so user-authored
 * "Sandton Convention Centre, Johannesburg" beats a stray lat/lng.
 */
export function getCityLabel(
  locationText: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): string | null {
  if (locationText && locationText.trim().length > 0) {
    const hay = paddedHaystack(locationText);
    for (const city of CITIES) {
      for (const name of city.names) {
        // Names are already lowercase; pad with spaces for short codes
        // that would otherwise match inside words.
        const needle = name.length <= 3 ? ` ${name} ` : name;
        if (hay.includes(needle)) return city.code;
      }
    }
  }

  if (typeof lat === "number" && typeof lng === "number") {
    let best: { code: CityCode; dist: number } | null = null;
    for (const city of CITIES) {
      const d = distanceKm([lat, lng], city.center);
      if (d <= CITY_RADIUS_KM && (best === null || d < best.dist)) {
        best = { code: city.code, dist: d };
      }
    }
    if (best) return best.code;
  }

  return null;
}
