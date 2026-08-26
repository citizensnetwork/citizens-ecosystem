/**
 * The standalone frontend (`src/frontend/app/*.jsx`) is plain
 * `React.createElement` inside IIFEs that publish onto `window`, with no build
 * step and therefore no import graph a test can hook into. Two pieces of it
 * carry real logic that a rendering test would never pin down, so they are
 * evaluated directly here:
 *
 *  1. `data.jsx`'s SOCIAL_PLATFORMS table — the single place a stored handle
 *     becomes a clickable link. Getting this wrong sends a citizen to the
 *     wrong page (or nowhere), and it is exactly what broke for the founder:
 *     handles that were saved but never rendered as anything usable.
 *  2. `map.jsx`'s zoom gates — the thresholds that decide whether a place or
 *     an event is on the map at all. A silent off-by-one here empties the map.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(process.cwd(), "src/frontend/app");

type SocialPlatform = {
  key: string;
  label: string;
  icon: string;
  urlFor: (v: string) => string;
};
type DataGlobal = {
  SOCIAL_PLATFORMS: SocialPlatform[];
  SOCIAL_COLUMNS: Record<string, Record<string, string>>;
  getSocialPlatform: (k: string) => SocialPlatform;
  socialDisplay: (k: string, v: string) => string;
  socialsFromRow: (row: Record<string, unknown>, cols: Record<string, string>) => Record<string, string>;
  socialsToRow: (socials: Record<string, string>, kind: string) => Record<string, string | null>;
};
type MapZoom = {
  GATES: { place: number; event: number };
  LABELS: number;
  bandFor: (z: number) => string;
  hidden: (type: string, z: number, selected: boolean) => boolean;
};

/** Evaluate one frontend IIFE against a stub `window` and return that window. */
function loadFrontend(file: string, win: Record<string, unknown> = {}) {
  const src = readFileSync(join(APP_DIR, file), "utf8");
  // Enough of React for a module body that only DESTRUCTURES hooks at load
  // time; nothing here renders.
  const React = {
    createElement: () => null,
    useRef: () => ({ current: null }),
    useEffect: () => {},
    useState: () => [undefined, () => {}],
    useCallback: (f: unknown) => f,
    Fragment: "Fragment",
  };
  new Function("window", "React", "document", src)(win, React, undefined);
  return win as Record<string, unknown>;
}

let DATA: DataGlobal;
let MAP_ZOOM: MapZoom;

beforeAll(() => {
  DATA = loadFrontend("data.jsx").DATA as DataGlobal;
  MAP_ZOOM = loadFrontend("map.jsx").MAP_ZOOM as MapZoom;
});

describe("SOCIAL_PLATFORMS — one table for every surface", () => {
  it("covers the seven platforms migration 172 gave all three entity types", () => {
    expect(DATA.SOCIAL_PLATFORMS.map((p) => p.key)).toEqual([
      "instagram",
      "facebook",
      "youtube",
      "tiktok",
      "x",
      "linkedin",
      "whatsapp",
    ]);
  });

  it("never lets a brand mark shadow a lucide UI glyph", () => {
    // This bit us for real: the brand table is consulted BEFORE lucide, and
    // lucide's close/dismiss icon is called `X` — so an unprefixed X brand
    // mark turned every close button in the app into the X logo. Every key is
    // `Brand…`-prefixed now, which makes the collision impossible by
    // construction rather than by vigilance.
    const iconsWin = loadFrontend("icons.jsx", {}) as { Icon: { BRANDS: Record<string, string> } };
    for (const key of Object.keys(iconsWin.Icon.BRANDS)) {
      expect(key.startsWith("Brand"), `${key} is not Brand-prefixed`).toBe(true);
    }
  });

  it("names an icon that Icon can actually draw — lucide 1.x ships NO brand marks", () => {
    // The founder's report was "I'm not sure which Social platform it is, as
    // there isn't any social media logo next to it": lucide 1.34.0 removed
    // Instagram/Facebook/Youtube/Twitter/Linkedin, and <Icon> degrades an
    // unknown name to an EMPTY <svg>. Brand marks are shipped in icons.jsx
    // now, so every platform's icon must resolve there.
    const iconsWin = loadFrontend("icons.jsx", {}) as { Icon: { BRANDS: Record<string, string> } };
    for (const p of DATA.SOCIAL_PLATFORMS) {
      expect(iconsWin.Icon.BRANDS[p.icon], `${p.label} has no brand mark`).toBeTruthy();
    }
  });

  it("has a column for every platform on every entity type", () => {
    for (const kind of ["event", "place", "contributor"]) {
      const cols = DATA.SOCIAL_COLUMNS[kind];
      for (const p of DATA.SOCIAL_PLATFORMS) {
        expect(cols[p.key], `${kind}.${p.key}`).toBeTruthy();
      }
    }
  });

  it("builds the same link from a bare handle and from a pasted URL", () => {
    const cases: [string, string, string][] = [
      ["instagram", "dam_cool_bois", "https://instagram.com/dam_cool_bois"],
      ["instagram", "@dam_cool_bois", "https://instagram.com/dam_cool_bois"],
      ["instagram", "instagram.com/dam_cool_bois", "https://instagram.com/dam_cool_bois"],
      ["facebook", "@ourchurch", "https://facebook.com/ourchurch"],
      ["youtube", "ourchurch", "https://youtube.com/@ourchurch"],
      ["youtube", "c/ourchurch", "https://youtube.com/c/ourchurch"],
      ["tiktok", "ourchurch", "https://tiktok.com/@ourchurch"],
      ["x", "@ourchurch", "https://x.com/ourchurch"],
      ["linkedin", "ourchurch", "https://www.linkedin.com/company/ourchurch"],
      ["linkedin", "in/grace", "https://www.linkedin.com/in/grace"],
      ["whatsapp", "+27 82 000 0000", "https://wa.me/27820000000"],
    ];
    for (const [key, input, expected] of cases) {
      expect(DATA.getSocialPlatform(key).urlFor(input), `${key} ← ${input}`).toBe(expected);
    }
  });

  it("passes an absolute URL through untouched and never invents a link from nothing", () => {
    expect(DATA.getSocialPlatform("facebook").urlFor("https://fb.me/x")).toBe("https://fb.me/x");
    for (const p of DATA.SOCIAL_PLATFORMS) {
      expect(p.urlFor(""), p.label).toBe("");
      expect(p.urlFor("   "), p.label).toBe("");
    }
  });

  it("gives an unknown platform key a safe generic link rather than a wrong brand", () => {
    const unknown = DATA.getSocialPlatform("threads");
    expect(unknown.icon).toBe("Link");
    expect(unknown.urlFor("threads.net/@x")).toBe("https://threads.net/@x");
  });

  it("round-trips a row through socialsFromRow / socialsToRow", () => {
    const row = { instagram_handle: "  dam  ", x_handle: "@dam", youtube_url: "", linkedin_url: null };
    expect(DATA.socialsFromRow(row, DATA.SOCIAL_COLUMNS.contributor)).toEqual({
      instagram: "dam",
      x: "@dam",
    });
    // A cleared field must write null, not be omitted — otherwise removing a
    // handle in the portal would silently leave the old one live.
    const written = DATA.socialsToRow({ instagram: "dam", facebook: "" }, "place");
    expect(written.instagram_url).toBe("dam");
    expect(written.facebook_url).toBeNull();
    expect(Object.keys(written)).toHaveLength(7);
  });

  it("shows a readable chip label instead of a raw pasted URL", () => {
    expect(DATA.socialDisplay("instagram", "https://instagram.com/dam")).toBe("dam");
    expect(DATA.socialDisplay("instagram", "@dam")).toBe("@dam");
    expect(DATA.socialDisplay("whatsapp", "https://wa.me/27820000000")).toBe("+27820000000");
  });
});

describe("map zoom gates", () => {
  it("hides places at provincial zoom and events too at national zoom", () => {
    // z≈10-11 metro · z≈8-9 province · z≈5-6 the whole country.
    expect(MAP_ZOOM.bandFor(11)).toBe("all");
    expect(MAP_ZOOM.bandFor(8.5)).toBe("places");
    expect(MAP_ZOOM.bandFor(5.5)).toBe("contributors");

    expect(MAP_ZOOM.hidden("place", 11, false)).toBe(false);
    expect(MAP_ZOOM.hidden("place", 8.5, false)).toBe(true);
    expect(MAP_ZOOM.hidden("event", 8.5, false)).toBe(false);
    expect(MAP_ZOOM.hidden("event", 5.5, false)).toBe(true);
  });

  it("never gates a contributor — an organisation is what national zoom is for", () => {
    for (const z of [2, 5.5, 8.5, 11, 16]) {
      expect(MAP_ZOOM.hidden("contributor", z, false), `z=${z}`).toBe(false);
      expect(MAP_ZOOM.hidden("idea", z, false), `z=${z}`).toBe(false);
    }
  });

  it("never gates the SELECTED pin — its preview panel is open", () => {
    expect(MAP_ZOOM.hidden("place", 3, true)).toBe(false);
    expect(MAP_ZOOM.hidden("event", 3, true)).toBe(false);
  });

  it("keeps the gates ordered and the label threshold above both", () => {
    expect(MAP_ZOOM.GATES.event).toBeLessThan(MAP_ZOOM.GATES.place);
    expect(MAP_ZOOM.LABELS).toBeGreaterThan(MAP_ZOOM.GATES.place);
  });
});
