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
  isPastEvent: (e: Record<string, unknown> | null | undefined, now?: number) => boolean;
  SOCIAL_PLATFORMS: SocialPlatform[];
  SOCIAL_COLUMNS: Record<string, Record<string, string>>;
  getSocialPlatform: (k: string) => SocialPlatform;
  socialDisplay: (k: string, v: string) => string;
  socialsFromRow: (row: Record<string, unknown>, cols: Record<string, string>) => Record<string, string>;
  socialsToRow: (socials: Record<string, string>, kind: string) => Record<string, string | null>;
};
type MapZoom = {
  GATES: { place: number; event: number; contributor: number };
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
      // A pasted URL whose path ALREADY carries the platform's own prefix must
      // not get a second one — "tiktok.com/@dam" became "tiktok.com/@@dam",
      // a dead link. (stripHandle only removes a LEADING @, and the @ is no
      // longer leading once the host comes off the front.)
      ["tiktok", "tiktok.com/@ourchurch", "https://tiktok.com/@ourchurch"],
      ["youtube", "www.youtube.com/@ourchurch", "https://youtube.com/@ourchurch"],
      ["instagram", "www.instagram.com/ourchurch", "https://instagram.com/ourchurch"],
      ["linkedin", "www.linkedin.com/company/ourchurch", "https://www.linkedin.com/company/ourchurch"],
    ];
    for (const [key, input, expected] of cases) {
      expect(DATA.getSocialPlatform(key).urlFor(input), `${key} ← ${input}`).toBe(expected);
    }
  });

  it("only strips a leading www. when the platform's own host really follows it", () => {
    // The host prefix is stripped with plain string comparison, not a RegExp
    // built by concatenation — escaping a host into a pattern means getting
    // every metacharacter right, and the `.`-only escape it replaced was a
    // blocking CodeQL alert (js/incomplete-sanitization). These cases pin the
    // behaviour that rewrite had to preserve exactly.
    const ig = DATA.getSocialPlatform("instagram");
    expect(ig.urlFor("www.instagram.com/dam")).toBe("https://instagram.com/dam");
    // "www." with someone ELSE's host after it is not ours to strip.
    expect(ig.urlFor("www.example.com/dam")).toBe("https://instagram.com/www.example.com/dam");
    // A value that merely starts with the letters "www" is untouched.
    expect(ig.urlFor("wwwdam")).toBe("https://instagram.com/wwwdam");
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
    // Stored numbers are international digits without the "+" — show them as a number.
    expect(DATA.socialDisplay("whatsapp", "27712345678")).toBe("+27712345678");
  });
});

describe("map zoom gates", () => {
  it("peels pins away as you zoom out: places, then events, then contributors", () => {
    // z≈10-11 metro · z≈8-9 province · z≈6-7 several provinces · z<6 the country.
    expect(MAP_ZOOM.bandFor(11)).toBe("all");
    expect(MAP_ZOOM.bandFor(8.5)).toBe("places");
    expect(MAP_ZOOM.bandFor(6.5)).toBe("contributors");
    expect(MAP_ZOOM.bandFor(5.5)).toBe("none");

    expect(MAP_ZOOM.hidden("place", 11, false)).toBe(false);
    expect(MAP_ZOOM.hidden("place", 8.5, false)).toBe(true);
    expect(MAP_ZOOM.hidden("event", 8.5, false)).toBe(false);
    expect(MAP_ZOOM.hidden("event", 6.5, false)).toBe(true);
    expect(MAP_ZOOM.hidden("contributor", 6.5, false)).toBe(false);
    expect(MAP_ZOOM.hidden("contributor", 5.5, false)).toBe(true);
  });

  it("hides each type exactly below its own gate and shows it at the gate", () => {
    // Founder decision D1 (2026-10-02): Contributors hide below zoom 6 so the
    // national view reads clean. They used to be permanent anchors.
    expect(MAP_ZOOM.GATES).toEqual({ place: 9.5, event: 7.5, contributor: 6 });
    for (const type of ["place", "event", "contributor"] as const) {
      const gate = MAP_ZOOM.GATES[type];
      expect(MAP_ZOOM.hidden(type, gate - 0.01, false), `${type} just below`).toBe(true);
      expect(MAP_ZOOM.hidden(type, gate, false), `${type} at the gate`).toBe(false);
    }
  });

  it("reports a band that matches what is actually hidden, so the on-screen hint never lies", () => {
    for (const z of [3, 5.99, 6, 7.49, 7.5, 9.49, 9.5, 12]) {
      const hiddenTypes = (["contributor", "event", "place"] as const).filter((t) => MAP_ZOOM.hidden(t, z, false));
      const expected: Record<string, string[]> = {
        all: [],
        places: ["place"],
        contributors: ["event", "place"],
        none: ["contributor", "event", "place"],
      };
      expect(hiddenTypes.sort(), `z=${z}`).toEqual(expected[MAP_ZOOM.bandFor(z)].sort());
    }
  });

  it("never gates an Impact Idea — it is an opt-in layer", () => {
    for (const z of [2, 5.5, 8.5, 11, 16]) expect(MAP_ZOOM.hidden("idea", z, false), `z=${z}`).toBe(false);
  });

  it("never gates the SELECTED pin — its preview panel is open", () => {
    for (const type of ["place", "event", "contributor"]) expect(MAP_ZOOM.hidden(type, 3, true), type).toBe(false);
  });

  it("keeps the gates ordered, with names appearing only once every pin type is on screen", () => {
    expect(MAP_ZOOM.GATES.contributor).toBeLessThan(MAP_ZOOM.GATES.event);
    expect(MAP_ZOOM.GATES.event).toBeLessThan(MAP_ZOOM.GATES.place);
    expect(MAP_ZOOM.LABELS).toBeGreaterThan(MAP_ZOOM.GATES.place);
    // Founder decision D2: names from neighbourhood scale.
    expect(MAP_ZOOM.LABELS).toBe(15);
  });
});

describe("isPastEvent — what leaves the map and the discovery list", () => {
  const NOW = new Date("2026-10-02T12:00:00").getTime();
  const at = (iso: string) => new Date(iso).toISOString();

  it("is past once its end is behind us, and not before", () => {
    const e = { startsAt: at("2026-10-02T09:00:00"), endsAt: at("2026-10-02T11:00:00") };
    expect(DATA.isPastEvent(e, NOW)).toBe(true);
    expect(DATA.isPastEvent({ ...e, endsAt: at("2026-10-02T13:00:00") }, NOW)).toBe(false);
  });

  it("an event that has started but not ended is still on", () => {
    expect(DATA.isPastEvent({ startsAt: at("2026-10-02T11:00:00"), endsAt: at("2026-10-02T14:00:00") }, NOW)).toBe(false);
  });

  it("with no end time, stays up for the rest of its day, then goes", () => {
    // End time is optional on the create form; a 09:00 service must not vanish at 09:00.
    expect(DATA.isPastEvent({ startsAt: at("2026-10-02T09:00:00") }, NOW)).toBe(false);
    expect(DATA.isPastEvent({ startsAt: at("2026-10-01T18:00:00") }, NOW)).toBe(true);
  });

  it("the three real production events (May, June, August) are all past in October", () => {
    for (const date of ["2026-05-29", "2026-06-25", "2026-08-29"]) {
      expect(DATA.isPastEvent({ startsAt: at(`${date}T16:00:00`) }, NOW), date).toBe(true);
    }
  });

  it("falls back to the calendar date for an event with no timestamps (an optimistic local draft)", () => {
    expect(DATA.isPastEvent({ date: "2026-10-02" }, NOW)).toBe(false);
    expect(DATA.isPastEvent({ date: "2026-10-03" }, NOW)).toBe(false);
    expect(DATA.isPastEvent({ date: "2026-10-01" }, NOW)).toBe(true);
  });

  it("never calls an event with no time information past — one stale pin beats a hidden live event", () => {
    expect(DATA.isPastEvent({}, NOW)).toBe(false);
    expect(DATA.isPastEvent({ startsAt: "not a date", date: "" }, NOW)).toBe(false);
    expect(DATA.isPastEvent(null, NOW)).toBe(false);
    expect(DATA.isPastEvent(undefined, NOW)).toBe(false);
  });
});

describe("social links never render a value that isn't a link", () => {
  const link = (key: string, v: string) => DATA.getSocialPlatform(key).urlFor(v);

  it("makes no link from a display name (the first real Form submission)", () => {
    expect(link("facebook", "Grace Radio")).toBe("");
    expect(link("youtube", "Grace Online")).toBe("");
    expect(link("instagram", "Grace Point Church")).toBe("");
    expect(link("tiktok", "our page")).toBe("");
    expect(link("x", "Grace Radio")).toBe("");
    expect(link("linkedin", "Grace Radio")).toBe("");
    expect(link("whatsapp", "call the office")).toBe("");
  });

  it("still links a real handle, a pasted URL and a spaced international number", () => {
    expect(link("facebook", "GraceRadio")).toBe("https://facebook.com/GraceRadio");
    expect(link("facebook", "https://facebook.com/grace radio")).toBe("https://facebook.com/grace radio");
    expect(link("whatsapp", "+44 7911 123456")).toBe("https://wa.me/447911123456");
  });

  it("opens a local South African WhatsApp number through wa.me in international form", () => {
    // wa.me/0712345678 is a dead link; the number must lose its 0 and gain 27.
    expect(link("whatsapp", "0712345678")).toBe("https://wa.me/27712345678");
    expect(link("whatsapp", "071 234 5678")).toBe("https://wa.me/27712345678");
    expect(link("whatsapp", "27712345678")).toBe("https://wa.me/27712345678");
    expect(link("whatsapp", "+27 (0)71 234 5678")).toBe("https://wa.me/27712345678");
  });
});
