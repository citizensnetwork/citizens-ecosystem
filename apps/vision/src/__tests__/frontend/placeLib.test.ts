/**
 * The Place field's pure helpers (src/frontend/app/place-lib.jsx →
 * window.CV_PLACE) plus the wiring that has to stay true for the field to work:
 * the new files are registered in BOTH index.html and the build's appFileOrder,
 * every window.CV_PLACE.* name the screens call exists, and what the field
 * sends is accepted by the real POST /api/activities schema.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createActivitySchema, updateActivitySchema } from "../../lib/schemas/activity";

const root = process.cwd(); // apps/vision when run through its own vitest
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

type Place = { name: string; lat: number | null; lng: number | null };
type Hit = { id: string; label: string; lat: number; lng: number };
type Env = { MAPTILER_KEY?: string };
type RowFields = { place: string; onMap: boolean; lat: number | null; lng: number | null };
type AuthFetch = (path: string, init?: { method?: string; body?: string }) => Promise<unknown>;
type SaveResult = { ok: true; fields: RowFields } | { ok: false; status: number; message: string };

interface Lib {
  NAME_MAX: number;
  MIN_QUERY: number;
  MAX_RESULTS: number;
  HOME: { lat: number; lng: number };
  EMPTY: Place;
  cleanName(s: unknown): string;
  coordLabel(lat: number, lng: number): string;
  parseCoordPair(q: unknown): { lat: number; lng: number } | null;
  searchUrl(env: Env | null, q: unknown): string | null;
  reverseUrl(env: Env | null, lat: unknown, lng: unknown): string | null;
  parseResults(json: unknown): Hit[];
  parseReverse(json: unknown): string;
  normalise(place: unknown): Place | null;
  kind(place: unknown): "empty" | "text" | "pinned";
  toPayload(place: unknown): Record<string, unknown>;
  toPatch(place: unknown): Record<string, unknown>;
  samePlace(a: unknown, b: unknown): boolean;
  fromRow(row: unknown): Place;
  fieldsOfPlace(place: unknown): RowFields;
  rowFields(row: unknown): RowFields;
  failureMessage(status: number): string;
  focusSoon(find: () => unknown): () => void;
  savePlace(authFetch: AuthFetch, id: string, place: unknown): Promise<SaveResult>;
  syncDemoMap(list: Record<string, unknown>[], key: string, meta: Record<string, unknown>, place: unknown): Record<string, unknown>[];
  demoMapRow(id: string, title: string, type: string, date: string, place: unknown): Record<string, unknown> | null;
}
type TimelineLib = { toPoints(rows: unknown[]): { id: string; lat: number; lng: number; place: string }[] };

function load(): { P: Lib; TL: TimelineLib } {
  const win: { CV_TIMELINE?: TimelineLib; CV_PLACE?: Lib } = {};
  // Same order the page loads them: timeline-lib first, place-lib reads it lazily.
  new Function("window", read("src/frontend/app/timeline-lib.jsx"))(win);
  new Function("window", read("src/frontend/app/place-lib.jsx"))(win);
  if (!win.CV_PLACE || !win.CV_TIMELINE) throw new Error("the libs did not publish their window globals");
  return { P: win.CV_PLACE, TL: win.CV_TIMELINE };
}
const { P, TL } = load();

const KEY: Env = { MAPTILER_KEY: "abc123" };
const feature = (over: Record<string, unknown> = {}) => ({
  id: "place.1",
  text: "Hatfield",
  place_name: "Hatfield, City of Tshwane Metropolitan Municipality, South Africa",
  center: [28.2431, -25.7508],
  ...over,
});

describe("cleanName", () => {
  it("trims, collapses runs of whitespace and tolerates non-strings", () => {
    expect(P.cleanName("  Mamelodi \n  community   hall ")).toBe("Mamelodi community hall");
    expect(P.cleanName(null)).toBe("");
    expect(P.cleanName(undefined)).toBe("");
    expect(P.cleanName(42)).toBe("42");
  });
  it("stops at the 300 characters the API allows", () => {
    expect(P.NAME_MAX).toBe(300);
    expect(P.cleanName("a".repeat(500))).toHaveLength(300);
  });
  it("never leaves half an emoji at the cut", () => {
    const out = P.cleanName("a".repeat(299) + "😀");
    expect(out).toBe("a".repeat(299));
  });
});

describe("parseCoordPair", () => {
  it("reads latitude then longitude, however the numbers are separated", () => {
    const want = { lat: -25.7461, lng: 28.1881 };
    expect(P.parseCoordPair("-25.7461, 28.1881")).toEqual(want);
    expect(P.parseCoordPair("-25.7461,28.1881")).toEqual(want);
    expect(P.parseCoordPair("  -25.7461 28.1881 ")).toEqual(want);
    expect(P.parseCoordPair("-25.7461; 28.1881")).toEqual(want);
  });
  it("accepts whole-number coordinates", () => {
    expect(P.parseCoordPair("-26, 28")).toEqual({ lat: -26, lng: 28 });
  });
  it("rejects null island, out-of-range numbers and anything that is not exactly a pair", () => {
    expect(P.parseCoordPair("0, 0")).toBeNull();
    expect(P.parseCoordPair("91, 28")).toBeNull();
    expect(P.parseCoordPair("-25, 181")).toBeNull();
    expect(P.parseCoordPair("Hatfield")).toBeNull();
    expect(P.parseCoordPair("1, 2, 3")).toBeNull();
    expect(P.parseCoordPair("-25.7461")).toBeNull();
    expect(P.parseCoordPair("Hatfield 0083")).toBeNull();
    expect(P.parseCoordPair("")).toBeNull();
    expect(P.parseCoordPair(null)).toBeNull();
  });
});

describe("searchUrl", () => {
  it("builds the MapTiler geocoding URL with the key encoded and a Pretoria nudge", () => {
    const url = P.searchUrl({ MAPTILER_KEY: "k e&y" }, "  Hatfield   Pretoria ");
    expect(url).toBe(
      "https://api.maptiler.com/geocoding/Hatfield%20Pretoria.json?key=k%20e%26y&limit=5&language=en&proximity=28.19,-25.75",
    );
  });
  it("encodes characters that would change the path or the query", () => {
    const url = P.searchUrl(KEY, "St Mary's/Hall? #2")!;
    expect(url).toContain("/geocoding/St%20Mary's%2FHall%3F%20%232.json?");
    expect(url.split("?").length).toBe(2);
  });
  it("asks nothing without a usable key, so the field degrades to plain text", () => {
    expect(P.searchUrl({}, "Hatfield")).toBeNull();
    expect(P.searchUrl(null, "Hatfield")).toBeNull();
    expect(P.searchUrl({ MAPTILER_KEY: "" }, "Hatfield")).toBeNull();
    expect(P.searchUrl({ MAPTILER_KEY: "REPLACE_WITH_KEY" }, "Hatfield")).toBeNull();
  });
  it("waits for three characters before spending a request", () => {
    expect(P.searchUrl(KEY, "Ha")).toBeNull();
    expect(P.searchUrl(KEY, "  Ha  ")).toBeNull();
    expect(P.searchUrl(KEY, "Hat")).not.toBeNull();
  });
  it("never sends a coordinate pair to the forward geocoder (it would read it longitude first)", () => {
    expect(P.searchUrl(KEY, "-25.7461, 28.1881")).toBeNull();
  });
});

describe("reverseUrl", () => {
  it("puts longitude first, as MapTiler expects, and rounds to about 0.1 m", () => {
    expect(P.reverseUrl(KEY, -25.74827, 28.2321195297)).toBe(
      "https://api.maptiler.com/geocoding/28.23212,-25.74827.json?key=abc123&limit=1&language=en",
    );
  });
  it("needs a key and a real spot", () => {
    expect(P.reverseUrl({}, -25.7, 28.2)).toBeNull();
    expect(P.reverseUrl(KEY, 0, 0)).toBeNull();
    expect(P.reverseUrl(KEY, null, 28.2)).toBeNull();
    expect(P.reverseUrl(KEY, 95, 28.2)).toBeNull();
  });
});

describe("parseResults", () => {
  it("turns features into choices with the label, latitude and longitude the right way round", () => {
    const [h] = P.parseResults({ features: [feature()] });
    expect(h).toEqual({
      id: "place.1",
      label: "Hatfield, City of Tshwane Metropolitan Municipality, South Africa",
      lat: -25.7508,
      lng: 28.2431,
    });
  });
  it("uses the short name when there is no full one", () => {
    const [h] = P.parseResults({ features: [feature({ place_name: undefined })] });
    expect(h!.label).toBe("Hatfield");
  });
  it("drops results it cannot place and never plots them somewhere made up", () => {
    const out = P.parseResults({
      features: [
        feature({ id: "ok" }),
        feature({ id: "no-centre", center: undefined }),
        feature({ id: "null-centre", center: [null, null] }),
        feature({ id: "half", center: [28.2] }),
        feature({ id: "text-centre", center: ["28.2", "-25.7"] }),
        feature({ id: "island", center: [0, 0], place_name: "Null Island" }),
        feature({ id: "off-planet", center: [200, -25], place_name: "Elsewhere" }),
        feature({ id: "no-label", place_name: "", text: "" }),
        null,
      ],
    });
    expect(out.map((r) => r.id)).toEqual(["ok"]);
  });
  it("collapses results that read the same and stops at five", () => {
    const dup = P.parseResults({
      features: [feature({ id: "a" }), feature({ id: "b", place_name: "HATFIELD, City of Tshwane Metropolitan Municipality, South Africa" })],
    });
    expect(dup).toHaveLength(1);
    const many = P.parseResults({
      features: Array.from({ length: 9 }, (_, i) => feature({ id: "p" + i, place_name: "Place " + i })),
    });
    expect(many).toHaveLength(P.MAX_RESULTS);
    expect(P.MAX_RESULTS).toBe(5);
  });
  it("survives a body that is not a result list", () => {
    expect(P.parseResults(null)).toEqual([]);
    expect(P.parseResults({})).toEqual([]);
    expect(P.parseResults({ features: "nope" })).toEqual([]);
    expect(P.parseResults({ features: [] })).toEqual([]);
    expect(P.parseResults("<html>")).toEqual([]);
  });
});

describe("parseReverse", () => {
  it("takes the first (most specific) name", () => {
    expect(P.parseReverse({ features: [feature({ place_name: "Festival Street 353, Tshwane" }), feature()] })).toBe("Festival Street 353, Tshwane");
  });
  it("is empty when MapTiler knows nothing there", () => {
    expect(P.parseReverse({ features: [] })).toBe("");
    expect(P.parseReverse(null)).toBe("");
    expect(P.parseReverse({})).toBe("");
  });
});

describe("normalise, kind and toPayload", () => {
  it("sends nothing at all when there is no place, so logging is unchanged", () => {
    for (const p of [null, undefined, P.EMPTY, { name: "   ", lat: null, lng: null }, { name: "", lat: 0, lng: 0 }]) {
      expect(P.normalise(p)).toBeNull();
      expect(P.kind(p)).toBe("empty");
      expect(P.toPayload(p)).toEqual({});
    }
  });
  it("sends a plain name with no coordinates", () => {
    const p = { name: "  Mamelodi community hall ", lat: null, lng: null };
    expect(P.kind(p)).toBe("text");
    expect(P.toPayload(p)).toEqual({ location_name: "Mamelodi community hall" });
  });
  it("sends all three fields for a name and a real spot, rounded to about 0.1 m", () => {
    const p = { name: "Hatfield", lat: -25.750833114245893, lng: 28.243055418133736 };
    expect(P.kind(p)).toBe("pinned");
    expect(P.toPayload(p)).toEqual({ latitude: -25.750833, longitude: 28.243055, location_name: "Hatfield" });
  });
  it("applies the Timeline Map's rule: null island and out-of-range pins become a plain name", () => {
    expect(P.toPayload({ name: "Somewhere", lat: 0, lng: 0 })).toEqual({ location_name: "Somewhere" });
    expect(P.toPayload({ name: "Somewhere", lat: 91, lng: 28 })).toEqual({ location_name: "Somewhere" });
    expect(P.toPayload({ name: "Somewhere", lat: -25, lng: 181 })).toEqual({ location_name: "Somewhere" });
  });
  it("never sends half a coordinate pair", () => {
    expect(P.toPayload({ name: "Somewhere", lat: -25.7, lng: null })).toEqual({ location_name: "Somewhere" });
    expect(P.toPayload({ name: "Somewhere", lat: null, lng: 28.2 })).toEqual({ location_name: "Somewhere" });
    expect(P.toPayload({ name: "", lat: -25.7, lng: null })).toEqual({});
  });
  it("names a pin by its coordinates when it has no name, so the list never shows a blank place", () => {
    const out = P.toPayload({ name: "", lat: -25.7461234, lng: 28.1881234 });
    expect(out).toEqual({ latitude: -25.746123, longitude: 28.188123, location_name: "Pin at -25.74612, 28.18812" });
  });
  it("caps the name at what the API accepts", () => {
    const out = P.toPayload({ name: "x".repeat(400), lat: null, lng: null });
    expect((out.location_name as string).length).toBe(300);
  });
  it("is always accepted by the real POST /api/activities schema", () => {
    const base = { title: "Food drive", type: "outreach" as const, date: "2026-10-16" };
    const places: unknown[] = [
      null,
      { name: "Plain name", lat: null, lng: null },
      { name: "Hatfield", lat: -25.7508, lng: 28.2431 },
      { name: "", lat: -25.7508, lng: 28.2431 },
      { name: "y".repeat(999), lat: -25.7508, lng: 28.2431 },
      { name: "z", lat: 0, lng: 0 },
      { name: "z", lat: 90, lng: 180 },
      { name: "z", lat: -90, lng: -180 },
    ];
    for (const p of places) {
      const r = createActivitySchema.safeParse({ ...base, ...P.toPayload(p) });
      expect(r.success, JSON.stringify(p)).toBe(true);
    }
  });
});

describe("rowFields (a saved activity in the list)", () => {
  it("shows the saved name, whether the Timeline Map can plot the row, and the spot", () => {
    expect(P.rowFields({ location_name: "Hatfield", latitude: -25.75, longitude: 28.24 })).toEqual({ place: "Hatfield", onMap: true, lat: -25.75, lng: 28.24 });
    expect(P.rowFields({ location_name: "Hatfield", latitude: null, longitude: null })).toEqual({ place: "Hatfield", onMap: false, lat: null, lng: null });
    expect(P.rowFields({ location_name: "Hatfield", latitude: 0, longitude: 0 })).toEqual({ place: "Hatfield", onMap: false, lat: null, lng: null });
  });
  it("copes with rows that carry no place at all", () => {
    const none = { place: "", onMap: false, lat: null, lng: null };
    expect(P.rowFields({})).toEqual(none);
    expect(P.rowFields({ location_name: null })).toEqual(none);
    expect(P.rowFields(null)).toEqual(none);
    expect(P.rowFields(undefined)).toEqual(none);
  });
  it("names a spot saved without a name by its coordinates, so the list never hides a pin", () => {
    expect(P.rowFields({ location_name: null, latitude: -25.7461, longitude: 28.1881 })).toEqual({
      place: "Pin at -25.74610, 28.18810", onMap: true, lat: -25.7461, lng: 28.1881,
    });
  });
  it("agrees with the map: onMap exactly when toPoints would plot the row", () => {
    const rows = [
      { id: "a", date: "2026-06-28", latitude: -25.7, longitude: 28.2, location_name: "A" },
      { id: "b", date: "2026-06-28", latitude: null, longitude: null, location_name: "B" },
      { id: "c", date: "2026-06-28", latitude: 0, longitude: 0, location_name: "C" },
      { id: "d", date: "2026-06-28", latitude: -25.7, longitude: null, location_name: "D" },
      { id: "e", date: "2026-06-28", latitude: -25.7, longitude: 28.2, location_name: null },
    ];
    const plotted = TL.toPoints(rows).map((p) => p.id);
    expect(rows.filter((r) => P.rowFields(r).onMap).map((r) => r.id)).toEqual(plotted);
  });
});

describe("demoMapRow (the demo's Timeline Map)", () => {
  it("builds a row the map plots, with the place it was given", () => {
    const row = P.demoMapRow("act-1", "Food drive", "outreach", "2026-10-16", { name: "Hatfield", lat: -25.7508, lng: 28.2431 });
    expect(row).not.toBeNull();
    const [pt] = TL.toPoints([row]);
    expect(pt).toMatchObject({ id: "act-1", lat: -25.7508, lng: 28.2431, place: "Hatfield" });
  });
  it("invents no participant count", () => {
    const row = P.demoMapRow("act-1", "Food drive", "outreach", "2026-10-16", { name: "Hatfield", lat: -25.7508, lng: 28.2431 });
    expect(row!.participant_count).toBe(0);
  });
  it("makes no map row for a place without a real spot", () => {
    expect(P.demoMapRow("a", "T", "event", "2026-10-16", null)).toBeNull();
    expect(P.demoMapRow("a", "T", "event", "2026-10-16", { name: "Just a name", lat: null, lng: null })).toBeNull();
    expect(P.demoMapRow("a", "T", "event", "2026-10-16", { name: "Island", lat: 0, lng: 0 })).toBeNull();
  });
});

describe("toPatch (editing a place that is already saved)", () => {
  it("clears all three columns when there is no place: an omitted field would leave the old place standing", () => {
    for (const p of [null, undefined, P.EMPTY, { name: "  ", lat: null, lng: null }, { name: "", lat: 0, lng: 0 }]) {
      expect(P.toPatch(p)).toEqual({ latitude: null, longitude: null, location_name: null });
    }
  });
  it("a name with no spot takes the activity off the map and keeps the name", () => {
    expect(P.toPatch({ name: " Hatfield Baptist hall ", lat: null, lng: null })).toEqual({
      latitude: null, longitude: null, location_name: "Hatfield Baptist hall",
    });
  });
  it("a name and a real spot send all three, rounded like a new activity", () => {
    expect(P.toPatch({ name: "Hatfield", lat: -25.750833114, lng: 28.243055418 })).toEqual({
      latitude: -25.750833, longitude: 28.243055, location_name: "Hatfield",
    });
  });
  it("never sends half a pair, and treats null island as no spot", () => {
    expect(P.toPatch({ name: "Somewhere", lat: -25.7, lng: null })).toEqual({ latitude: null, longitude: null, location_name: "Somewhere" });
    expect(P.toPatch({ name: "Somewhere", lat: 0, lng: 0 })).toEqual({ latitude: null, longitude: null, location_name: "Somewhere" });
  });
  it("always carries the three place keys and no others, so it can never touch a count or the tags", () => {
    const places: unknown[] = [null, P.EMPTY, { name: "x", lat: null, lng: null }, { name: "x", lat: -25.7, lng: 28.2 }, { name: "", lat: -25.7, lng: 28.2 }];
    for (const p of places) expect(Object.keys(P.toPatch(p)).sort()).toEqual(["latitude", "location_name", "longitude"]);
  });
  it("is always accepted by the real PATCH /api/activities/:id schema, and survives it unchanged", () => {
    const places: unknown[] = [
      null,
      P.EMPTY,
      { name: "Plain name", lat: null, lng: null },
      { name: "Hatfield", lat: -25.7508, lng: 28.2431 },
      { name: "", lat: -25.7508, lng: 28.2431 },
      { name: "y".repeat(999), lat: -25.7508, lng: 28.2431 },
      { name: "z", lat: 0, lng: 0 },
      { name: "z", lat: 90, lng: 180 },
      { name: "z", lat: -90, lng: -180 },
      { name: "half", lat: -25, lng: null },
    ];
    for (const p of places) {
      const r = updateActivitySchema.safeParse(P.toPatch(p));
      expect(r.success, JSON.stringify(p)).toBe(true);
      // Nothing is added behind our back (the Zod 4 defaults once added a count and tags).
      if (r.success) expect(r.data, JSON.stringify(p)).toEqual(P.toPatch(p));
    }
  });
});

describe("samePlace", () => {
  it("is true for the same place however it was typed, and for two empty places", () => {
    expect(P.samePlace({ name: " Hatfield ", lat: -25.75, lng: 28.24 }, { name: "Hatfield", lat: -25.7500001, lng: 28.2400001 })).toBe(true);
    expect(P.samePlace(null, P.EMPTY)).toBe(true);
    expect(P.samePlace({ name: " ", lat: null, lng: null }, undefined)).toBe(true);
  });
  it("is false when the name, the spot or having a place at all differs", () => {
    const a = { name: "Hatfield", lat: -25.75, lng: 28.24 };
    expect(P.samePlace(a, { ...a, name: "Brooklyn" })).toBe(false);
    expect(P.samePlace(a, { ...a, lat: -25.76 })).toBe(false);
    expect(P.samePlace(a, { name: "Hatfield", lat: null, lng: null })).toBe(false);
    expect(P.samePlace(a, P.EMPTY)).toBe(false);
    expect(P.samePlace(P.EMPTY, a)).toBe(false);
  });
});

describe("fromRow and fieldsOfPlace (the editor's starting point and the list's new look)", () => {
  it("a saved row becomes the place the editor starts from, spot included", () => {
    expect(P.fromRow({ location_name: "Hatfield", latitude: -25.75, longitude: 28.24 })).toEqual({ name: "Hatfield", lat: -25.75, lng: 28.24 });
    expect(P.fromRow({ location_name: "Hatfield", latitude: null, longitude: null })).toEqual({ name: "Hatfield", lat: null, lng: null });
    expect(P.fromRow({})).toEqual(P.EMPTY);
  });
  it("a spot the map would not plot is not carried into the editor", () => {
    expect(P.fromRow({ location_name: "Island", latitude: 0, longitude: 0 })).toEqual({ name: "Island", lat: null, lng: null });
    expect(P.fromRow({ location_name: "Half", latitude: -25.7, longitude: null })).toEqual({ name: "Half", lat: null, lng: null });
  });
  it("fieldsOfPlace and rowFields are the two directions of the same shape", () => {
    const row = { location_name: "Hatfield", latitude: -25.7508, longitude: 28.2431 };
    expect(P.fieldsOfPlace(P.fromRow(row))).toEqual(P.rowFields(row));
    expect(P.fieldsOfPlace(null)).toEqual({ place: "", onMap: false, lat: null, lng: null });
    expect(P.fieldsOfPlace({ name: "Just a name", lat: null, lng: null })).toEqual({ place: "Just a name", onMap: false, lat: null, lng: null });
  });
});

describe("savePlace (the PATCH, and what is believed afterwards)", () => {
  const HATFIELD = { name: "Hatfield", lat: -25.7508, lng: 28.2431 };
  const ROW_ID = "550e8400-e29b-41d4-a716-446655440000";
  const reply = (status: number, body?: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new SyntaxError("no body")) : Promise.resolve(body)),
  });
  const echo = (name: string | null, lat: number | null, lng: number | null) => ({
    data: { id: ROW_ID, location_name: name, latitude: lat, longitude: lng },
  });

  it("PATCHes /api/activities/:id with exactly toPatch(place) and returns what the server now holds", async () => {
    const calls: { path: string; init: { method?: string; body?: string } }[] = [];
    const authFetch: AuthFetch = (path, init) => {
      calls.push({ path, init: init ?? {} });
      return Promise.resolve(reply(200, echo("Hatfield", -25.7508, 28.2431)));
    };
    const out = await P.savePlace(authFetch, ROW_ID, HATFIELD);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe("/api/activities/" + ROW_ID);
    expect(calls[0]!.init.method).toBe("PATCH");
    expect(JSON.parse(calls[0]!.init.body!)).toEqual(P.toPatch(HATFIELD));
    expect(out).toEqual({ ok: true, fields: { place: "Hatfield", onMap: true, lat: -25.7508, lng: 28.2431 } });
  });
  it("clears a place with explicit nulls and reports the row as empty", async () => {
    let sent = "";
    const authFetch: AuthFetch = (_p, init) => {
      sent = init!.body!;
      return Promise.resolve(reply(200, echo(null, null, null)));
    };
    const out = await P.savePlace(authFetch, ROW_ID, P.EMPTY);
    expect(JSON.parse(sent)).toEqual({ latitude: null, longitude: null, location_name: null });
    expect(out).toEqual({ ok: true, fields: { place: "", onMap: false, lat: null, lng: null } });
  });
  it("accepts an echo that differs from the typed place only by the cleaning and rounding the lib itself applies", async () => {
    const authFetch: AuthFetch = () => Promise.resolve(reply(200, echo("Hatfield", -25.7508, 28.2431)));
    const out = await P.savePlace(authFetch, ROW_ID, { name: "  Hatfield ", lat: -25.75080004, lng: 28.2431 });
    expect(out.ok).toBe(true);
  });
  it("a 200 that echoes a different place is a failure, not a success (a server that quietly changed nothing)", async () => {
    const authFetch: AuthFetch = () => Promise.resolve(reply(200, echo(null, null, null)));
    const out = await P.savePlace(authFetch, ROW_ID, HATFIELD);
    expect(out).toMatchObject({ ok: false });
    expect((out as { message: string }).message).toContain("was not saved");
  });
  it("a 200 with no readable echo still counts as saved, and keeps the place that was sent", async () => {
    const authFetch: AuthFetch = () => Promise.resolve(reply(200));
    const out = await P.savePlace(authFetch, ROW_ID, HATFIELD);
    expect(out).toEqual({ ok: true, fields: P.fieldsOfPlace(HATFIELD) });
  });
  it.each([400, 401, 403, 404, 500, 503])("a %i answer is a failure with a message that says what to do", async (status) => {
    const authFetch: AuthFetch = () => Promise.resolve(reply(status, { error: "x" }));
    const out = await P.savePlace(authFetch, ROW_ID, HATFIELD);
    expect(out).toEqual({ ok: false, status, message: P.failureMessage(status) });
    expect(P.failureMessage(status)).toMatch(/place/i);
  });
  it("a request that never gets an answer (offline) is a failure too, never a thrown error", async () => {
    const authFetch: AuthFetch = () => Promise.reject(new TypeError("Failed to fetch"));
    const out = await P.savePlace(authFetch, ROW_ID, HATFIELD);
    expect(out).toEqual({ ok: false, status: 0, message: P.failureMessage(0) });
    expect(P.failureMessage(0)).toContain("connection");
  });
  it("gives each kind of failure its own message", () => {
    const msgs = new Set([0, 400, 401, 403, 500].map((s) => P.failureMessage(s)));
    expect(msgs.size).toBe(5);
    expect(P.failureMessage(403)).toBe(P.failureMessage(404));
  });
});

describe("focusSoon (focus that waits for the key press to finish)", () => {
  it("never moves focus in the task that asked for it, only after it", () => {
    vi.useFakeTimers();
    try {
      const el = { focus: vi.fn() };
      P.focusSoon(() => el);
      expect(el.focus).not.toHaveBeenCalled(); // Chrome would send this key press's keypress to the new element
      vi.runAllTimers();
      expect(el.focus).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it("looks for the element only when the time comes, so one that appears meanwhile is found", () => {
    vi.useFakeTimers();
    try {
      const find = vi.fn(() => null as { focus: () => void } | null);
      P.focusSoon(find);
      expect(find).not.toHaveBeenCalled();
      const el = { focus: vi.fn() };
      find.mockReturnValue(el);
      vi.runAllTimers();
      expect(find).toHaveBeenCalledTimes(1);
      expect(el.focus).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it("can be cancelled, and copes with nothing to focus", () => {
    vi.useFakeTimers();
    try {
      const el = { focus: vi.fn() };
      P.focusSoon(() => el)();
      vi.runAllTimers();
      expect(el.focus).not.toHaveBeenCalled();
      expect(() => { P.focusSoon(() => null); P.focusSoon(() => ({})); vi.runAllTimers(); }).not.toThrow();
    } finally { vi.useRealTimers(); }
  });
});

describe("syncDemoMap (the demo's Timeline Map follows an edit)", () => {
  const seed = () => [
    { id: "ma-1", title: "Food Drive", type: "outreach", date: "2026-06-28", latitude: -25.7118, longitude: 28.3995, location_name: "Mamelodi community hall", participant_count: 218, department_name: "Community Projects" },
    { id: "ma-2", title: "Mentorship", type: "event", date: "2026-06-21", latitude: -25.7487, longitude: 28.238, location_name: "Hatfield", participant_count: 94, department_name: "Outreach" },
  ];
  const ids = (list: Record<string, unknown>[]) => TL.toPoints(list).map((p) => p.id);

  it("moves the dot of an activity that already has one, keeping its reach and department", () => {
    const list = seed();
    P.syncDemoMap(list, "ma-1", { title: "Food Drive", type: "outreach", date: "2026-06-28" }, { name: "Atteridgeville", lat: -25.771, lng: 28.088 });
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: "ma-1", latitude: -25.771, longitude: 28.088, location_name: "Atteridgeville", participant_count: 218, department_name: "Community Projects" });
  });
  it("adds a dot for an activity that had none", () => {
    const list = seed();
    P.syncDemoMap(list, "act-9", { title: "New thing", type: "service", date: "2026-10-17" }, { name: "Hatfield", lat: -25.7508, lng: 28.2431 });
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ id: "act-9", title: "New thing", type: "service", date: "2026-10-17", latitude: -25.7508, longitude: 28.2431, location_name: "Hatfield", participant_count: 0 });
    expect(ids(list)).toContain("act-9");
  });
  it("a name with no spot takes the dot off the map but keeps the row and the name", () => {
    const list = seed();
    P.syncDemoMap(list, "ma-1", { title: "Food Drive" }, { name: "Somewhere in Mamelodi", lat: null, lng: null });
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: "ma-1", latitude: null, longitude: null, location_name: "Somewhere in Mamelodi", participant_count: 218 });
    expect(ids(list)).toEqual(["ma-2"]);
  });
  it("clearing the place takes the dot off the map, and putting it back restores the same row", () => {
    const list = seed();
    P.syncDemoMap(list, "ma-1", { title: "Food Drive" }, P.EMPTY);
    expect(ids(list)).toEqual(["ma-2"]);
    expect(list[0]!.location_name).toBeNull();
    P.syncDemoMap(list, "ma-1", { title: "Food Drive" }, { name: "Mamelodi", lat: -25.7118, lng: 28.3995 });
    expect(ids(list).sort()).toEqual(["ma-1", "ma-2"]);
    expect(list[0]).toMatchObject({ participant_count: 218, department_name: "Community Projects" });
  });
  it("makes no row for an activity that never had a spot and still has none", () => {
    const list = seed();
    P.syncDemoMap(list, "act-9", { title: "T", type: "event", date: "2026-10-17" }, { name: "Just a name", lat: null, lng: null });
    P.syncDemoMap(list, "act-9", { title: "T", type: "event", date: "2026-10-17" }, P.EMPTY);
    expect(list).toHaveLength(2);
  });
  it("edits the array it is given, and returns it", () => {
    const list = seed();
    expect(P.syncDemoMap(list, "ma-2", { title: "Mentorship" }, { name: "Brooklyn", lat: -25.7677, lng: 28.2395 })).toBe(list);
  });
});

describe("wiring that must stay true for the field to work", () => {
  it("registers place-lib.jsx and place-field.jsx in index.html AND appFileOrder, after timeline-lib and before views", () => {
    const html = read("src/frontend/index.html");
    const build = read("scripts/build-frontend.js");
    for (const f of ["place-lib.jsx", "place-field.jsx"]) {
      expect(html, f + " in index.html").toContain('src="app/' + f);
      expect(build, f + " in appFileOrder").toContain("'" + f + "'");
      expect(html.indexOf("app/" + f)).toBeGreaterThan(html.indexOf("app/timeline-lib.jsx"));
      expect(html.indexOf("app/" + f)).toBeLessThan(html.indexOf("app/views.jsx"));
      expect(build.indexOf("'" + f + "'")).toBeGreaterThan(build.indexOf("'timeline-lib.jsx'"));
      expect(build.indexOf("'" + f + "'")).toBeLessThan(build.indexOf("'views.jsx'"));
    }
    // The field reads CV_PLACE at load, so the lib must come first.
    expect(html.indexOf("app/place-lib.jsx")).toBeLessThan(html.indexOf("app/place-field.jsx"));
    expect(build.indexOf("'place-lib.jsx'")).toBeLessThan(build.indexOf("'place-field.jsx'"));
  });
  it("only calls window.CV_PLACE names that exist (these files have no type checker)", () => {
    const names = (src: string, re: RegExp) => [...src.matchAll(re)].map((m) => m[1]!);
    const field = names(read("src/frontend/app/place-field.jsx"), /\bP\.([A-Za-z_]+)/g);
    const views = names(read("src/frontend/app/views.jsx"), /\b(?:PL|window\.CV_PLACE)\.([A-Za-z_]+)/g);
    const win: { CV_TIMELINE?: unknown; CV_PLACE?: Record<string, unknown> } = {};
    new Function("window", read("src/frontend/app/timeline-lib.jsx"))(win);
    new Function("window", read("src/frontend/app/place-lib.jsx"))(win);
    const have = Object.keys(win.CV_PLACE!);
    expect(field.length).toBeGreaterThan(5);
    expect(views.length).toBeGreaterThan(2);
    for (const n of new Set([...field, ...views])) expect(have, n + " is not exported by place-lib.jsx").toContain(n);
  });
  it("returns focus to the place button through focusSoon, never inside the key press that closed the editor", () => {
    const views = read("src/frontend/app/views.jsx");
    expect(views).toMatch(/focusSoon\(\(\) => document\.querySelector\('\[data-cv-place-trigger/);
    expect(views).not.toMatch(/data-cv-place-trigger="' \+ [a-zA-Z.]+ \+ '"\]'\)\s*;?\s*
\s*(if \(el\) )?el\.focus/);
  });
  it("registers PlaceEditor next to PlaceField and the Activities screen uses it", () => {
    expect(read("src/frontend/app/place-field.jsx")).toMatch(/Object\.assign\(window\.Screens \|\| \{\}, \{ PlaceField, PlaceEditor \}\)/);
    expect(read("src/frontend/app/views.jsx")).toContain("window.Screens.PlaceEditor");
    expect(read("src/frontend/app/views.jsx")).toContain("<PlaceEditor ");
  });
  it("is allowed by the CSP as shipped: geocoding goes to the MapTiler host already in connect-src", () => {
    const cfg = read("next.config.ts");
    expect(cfg).toMatch(/connect-src[^"]*https:\/\/api\.maptiler\.com/);
    expect(read("src/frontend/app/place-lib.jsx")).toContain("https://api.maptiler.com/geocoding/");
    expect(cfg).not.toMatch(/script-src[^"]*'unsafe-inline'/);
  });
});
