/**
 * "Online in this area" (`src/frontend/app/map-v2-online.jsx`, issue #259, PR C): the globe button and its list.
 *
 * Two things are pinned. (1) WHEN we ask: the pure watcher waits for the map to be still, asks once per area that comes into
 * view, reuses a fresh answer, drops a late answer for an area that is no longer in view, and never asks per frame. (2) WHAT a
 * person sees: nothing at all when nobody serves the area in view; otherwise ONE labelled button among the map's controls with a
 * count; a list that groups by how specific the chosen area is, carries each owner's tag (Online or No fixed place), has a quiet
 * "Also reaching this area" of at most five, and says "Online or no fixed place", never "on the map". The real components are
 * mounted with the real React in jsdom against a stand-in map, public API and Back guard.
 */
import React from "react";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createPortal } from "react-dom";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const GP = U(1), PTA = U(3), CEN = U(4), HAT = U(7);
function row(id: string, name: string, level: string, parent: string | null, c: [number, number], b: [number, number, number, number]) {
  return { id, name, level, parent_id: parent, slug: name.toLowerCase(), sort: 0, centroid_lat: c[0], centroid_lng: c[1], bbox_south: b[0], bbox_west: b[1], bbox_north: b[2], bbox_east: b[3] };
}
const AREAS = [
  row(GP, "Gauteng", "province", null, [-26.2, 28.1], [-26.9, 27.2, -25.1, 29.0]),
  row(PTA, "Pretoria", "place", GP, [-25.7479, 28.2293], [-25.9, 28.05, -25.62, 28.4]),
  row(CEN, "Centurion", "place", GP, [-25.8603, 28.1894], [-25.93, 28.08, -25.8, 28.26]),
];
const SUBURBS = [row(HAT, "Hatfield", "suburb", PTA, [-25.7487, 28.2389], [-25.7607, 28.2269, -25.7367, 28.2509])];
const PRETORIA_VIEW = { lat: -25.7479, lng: 28.2293, zoom: 11 };

type Win = Record<string, unknown> & {
  MapV2Online: { SETTLE_MS: number; FRESH_MS: number; createWatcher: (o: Record<string, unknown>) => Watcher; groupMain: (m: unknown[]) => { level: string; items: { name: string }[] }[]; Globe: React.ComponentType<Record<string, unknown>>; OnlineSheet: React.ComponentType<Record<string, unknown>> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MapV2Strings: { online: Record<string, any> };
};
type Watcher = { requests: number; settle: () => void; retry: () => void; dispose: () => void; peek: () => { areaId: string | null; status: string; data: unknown } };
let W: Win;
const backGuards: (() => void)[] = [];

function load(file: string) {
  const src = readFileSync(join(process.cwd(), "src/frontend/app", file), "utf8");
  new Function("window", "React", "document", src)(window, React, document);
}
beforeAll(() => {
  const w = window as unknown as Record<string, unknown>;
  function StubIcon({ name }: { name: string }) { return React.createElement("i", { "data-icon": name }); }
  function StubButton({ children }: { children: React.ReactNode }) { return React.createElement("button", null, children); }
  w.Icon = StubIcon;
  w.UI = { cx: (...a: unknown[]) => a.filter(Boolean).join(" "), Button: StubButton };
  w.ReactDOM = { createPortal: (el: React.ReactNode, host: Element) => createPortal(el, host) };
  w.DATA = { getCategory: (id: string) => (id === "worship" ? { hex: "#8E44AD", icon: "Mic", name: "Worship" } : undefined) };
  // the Back guard: record each registration so a test can press Back
  function useBackGuardStub(active: boolean, onBack: () => void) {
    const ref = React.useRef(onBack);
    ref.current = onBack;
    React.useEffect(() => {
      if (!active) return undefined;
      const fn = () => ref.current();
      backGuards.push(fn);
      return () => { const i = backGuards.indexOf(fn); if (i >= 0) backGuards.splice(i, 1); };
    }, [active]);
  }
  w.useBackGuard = useBackGuardStub;
  load("map-v2-strings.jsx");
  load("serving-areas-lib.jsx");
  load("map-v2-online.jsx");
  W = window as unknown as Win;
});

// ── (1) the watcher ─────────────────────────────────────────────────────
function harness(over: Record<string, unknown> = {}) {
  let view: { lat: number; lng: number; zoom: number } | null = { ...PRETORIA_VIEW };
  let t = 1_000_000;
  const timers: { fn: () => void; ms: number; id: number }[] = [];
  let nextId = 1;
  const states: { areaId: string | null; status: string; data: unknown }[] = [];
  const loads: { areaId: string; resolve: (v: unknown) => void }[] = [];
  let area: string | null = PTA;
  const w = W.MapV2Online.createWatcher({
    getView: () => view,
    resolve: () => area,
    load: (areaId: string) => new Promise((resolve) => loads.push({ areaId, resolve })),
    onState: (s: { areaId: string | null; status: string; data: unknown }) => states.push(s),
    now: () => t,
    setTimer: (fn: () => void, ms: number) => { const id = nextId++; timers.push({ fn, ms, id }); return id; },
    clearTimer: (id: number) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1); },
    ...over,
  });
  const flush = async () => { const due = timers.splice(0); for (const x of due) x.fn(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  const answer = async (i: number, v: unknown) => { loads[i]!.resolve(v); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  return { w, timers, states, loads, flush, answer, setArea: (a: string | null) => { area = a; }, setView: (v: typeof view) => { view = v; }, advance: (ms: number) => { t += ms; } };
}
const OK = (n = 1) => ({ ok: true, area: { id: PTA, name: "Pretoria", level: "place" }, main: Array.from({ length: n }, (_, i) => ({ id: U(300 + i), name: "P" + i, served: { id: PTA, name: "Pretoria", level: "place" }, presence: "online" })), also: [] });

describe("when we ask", () => {
  it("waits for the map to be still: several moves inside the window make ONE look", async () => {
    const h = harness();
    h.w.settle(); h.w.settle(); h.w.settle();
    expect(h.timers).toHaveLength(1);
    expect(h.timers[0]!.ms).toBe(W.MapV2Online.SETTLE_MS);
    await h.flush();
    expect(h.loads).toHaveLength(1);
  });
  it("asks once per area, however long the person pans inside it", async () => {
    const h = harness();
    h.w.settle(); await h.flush(); await h.answer(0, OK());
    for (let i = 0; i < 10; i++) { h.advance(2000); h.w.settle(); await h.flush(); }
    expect(h.w.requests).toBe(1);
    expect(h.states.at(-1)!.status).toBe("ready");
  });
  it("does not ask twice for the same area while the first answer is still on its way", async () => {
    const h = harness();
    h.w.settle(); await h.flush();                      // asked, no answer yet
    h.advance(1000); h.w.settle(); await h.flush();     // the map settles again in the same area
    expect(h.w.requests).toBe(1);
    expect(h.loads).toHaveLength(1);
  });
  it("asks again when a different area comes into view, and reuses a fresh answer when it comes back", async () => {
    const h = harness();
    h.w.settle(); await h.flush(); await h.answer(0, OK());
    h.setArea(CEN); h.w.settle(); await h.flush(); await h.answer(1, { ...OK(2), area: { id: CEN, name: "Centurion", level: "place" } });
    expect(h.w.requests).toBe(2);
    h.setArea(PTA); h.advance(5000); h.w.settle(); await h.flush();
    expect(h.w.requests).toBe(2); // Pretoria's answer is still fresh
    expect(h.w.peek()).toMatchObject({ areaId: PTA, status: "ready" });
  });
  it("asks again for the same area once its answer is older than a minute", async () => {
    const h = harness();
    h.w.settle(); await h.flush(); await h.answer(0, OK());
    h.advance(W.MapV2Online.FRESH_MS + 1); h.w.settle(); await h.flush();
    expect(h.w.requests).toBe(2);
  });
  it("asks for nothing, and goes quiet, where no area is in view", async () => {
    const h = harness();
    h.w.settle(); await h.flush(); await h.answer(0, OK());
    h.setArea(null); h.w.settle(); await h.flush();
    expect(h.w.requests).toBe(1);
    expect(h.w.peek()).toEqual({ areaId: null, status: "idle", data: null });
    const quiet = harness();
    quiet.setArea(null); quiet.w.settle(); await quiet.flush();
    expect(quiet.w.requests).toBe(0);
  });
  it("drops a late answer for an area that is no longer in view", async () => {
    const h = harness();
    h.w.settle(); await h.flush();                      // Pretoria asked, not answered yet
    h.setArea(CEN); h.w.settle(); await h.flush();      // the map moved on: Centurion asked
    await h.answer(0, OK(5));                           // the OLD answer lands late
    expect(h.w.peek()).toMatchObject({ areaId: CEN, status: "loading" });
    await h.answer(1, { ...OK(2), area: { id: CEN, name: "Centurion", level: "place" } });
    expect(h.w.peek()).toMatchObject({ areaId: CEN, status: "ready" });
    expect((h.w.peek().data as { main: unknown[] }).main).toHaveLength(2);
  });
  it("a failed read is an error state, and retry asks again", async () => {
    const h = harness();
    h.w.settle(); await h.flush(); await h.answer(0, { ok: false });
    expect(h.w.peek().status).toBe("error");
    h.w.retry(); await h.flush();
    expect(h.w.requests).toBe(2);
    await h.answer(1, OK());
    expect(h.w.peek().status).toBe("ready");
  });
  it("finishes the optional preparation (a city's suburbs) before resolving, and carries on if it fails", async () => {
    const order: string[] = [];
    const h = harness({ prepare: async () => { order.push("prepare"); }, resolve: () => { order.push("resolve"); return PTA; } });
    h.w.settle(); await h.flush();
    expect(order).toEqual(["prepare", "resolve"]);
    const bad = harness({ prepare: async () => { throw new Error("offline"); } });
    bad.w.settle(); await bad.flush();
    expect(bad.loads).toHaveLength(1);
  });
  it("does nothing once disposed, and without a map view", async () => {
    const h = harness();
    h.w.settle(); h.w.dispose(); await h.flush();
    expect(h.loads).toHaveLength(0);
    h.w.settle();
    expect(h.timers).toHaveLength(0);
    const none = harness();
    none.setView(null); none.w.settle(); await none.flush();
    expect(none.loads).toHaveLength(0);
  });
});

describe("grouping the main list", () => {
  it("is suburb, then city or town, then province, each A to Z", () => {
    const m = (id: number, name: string, level: string) => ({ id: U(id), name, served: { id: U(9), name: "x", level } });
    const groups = W.MapV2Online.groupMain([m(1, "zed", "province"), m(2, "Beta", "place"), m(3, "alpha", "place"), m(4, "Sub", "suburb"), m(5, "Aaa", "province")]);
    expect(groups.map((g) => [g.level, g.items.map((i) => i.name)])).toEqual([["suburb", ["Sub"]], ["place", ["alpha", "Beta"]], ["province", ["Aaa", "zed"]]]);
    expect(W.MapV2Online.groupMain([])).toEqual([]);
  });
});

// ── (2) the globe and its sheet ─────────────────────────────────────────
class FakeMap {
  handlers: Record<string, (() => void)[]> = {};
  controls: { ctl: { onAdd: (m: unknown) => HTMLElement; onRemove: () => void }; pos: string }[] = [];
  container = document.createElement("div");
  center = { lat: PRETORIA_VIEW.lat, lng: PRETORIA_VIEW.lng };
  zoom = PRETORIA_VIEW.zoom;
  constructor() { document.body.appendChild(this.container); }
  getCenter() { return this.center; }
  getZoom() { return this.zoom; }
  on(ev: string, fn: () => void) { (this.handlers[ev] ||= []).push(fn); }
  off(ev: string, fn: () => void) { this.handlers[ev] = (this.handlers[ev] || []).filter((x) => x !== fn); }
  addControl(ctl: { onAdd: (m: unknown) => HTMLElement; onRemove: () => void }, pos: string) { this.controls.push({ ctl, pos }); this.container.appendChild(ctl.onAdd(this)); }
  removeControl(ctl: { onRemove: () => void }) { this.controls = this.controls.filter((c) => c.ctl !== ctl); ctl.onRemove(); }
  emit(ev: string) { (this.handlers[ev] || []).forEach((f) => f()); }
}

type Served = ReturnType<typeof person>;
const person = (id: number, name: string, over: Record<string, unknown> = {}) => ({ id: U(id), name, slug: null, kind: null, category: "worship", avatar_url: null, logo_url: null, presence: "online", served: { id: PTA, name: "Pretoria", level: "place" }, ...over });
const alsoP = (id: number, name: string, over: Record<string, unknown> = {}) => ({ id: U(id), name, slug: null, kind: null, category: null, avatar_url: null, logo_url: null, presence: "no_fixed_place", centre_name: "Midrand", radius_km: 50, distance_km: 22.4, ...over });

let requests: string[] = [];
function installApi(serving: Record<string, { main: Served[]; also_served_by: unknown[]; name?: string } | "fail">) {
  requests = [];
  vi.stubGlobal("fetch", vi.fn((path: string) => {
    requests.push(path);
    const url = new URL(path, "http://localhost");
    if (url.pathname === "/api/v1/service-areas") {
      const parent = url.searchParams.get("parent");
      const data = parent ? SUBURBS.filter((a) => a.parent_id === parent) : AREAS;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data }) });
    }
    if (url.pathname === "/api/v1/serving") {
      const id = url.searchParams.get("area")!;
      const s = serving[id];
      if (!s || s === "fail") return Promise.resolve({ ok: false, status: s === "fail" ? 500 : 404, json: () => Promise.resolve({}) });
      const a = AREAS.concat(SUBURBS).find((x) => x.id === id)!;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: { area: { id, name: s.name ?? a.name, slug: a.slug, level: a.level }, main: s.main, also_served_by: s.also_served_by } }) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  }));
}
function setFlags(globe = true) {
  const w = window as unknown as Record<string, unknown>;
  w.MapV2 = { onlineGlobe: globe, dur: () => 0 };
}

async function mountGlobe(opts: { map?: FakeMap; onOpenProfile?: (id: string) => void } = {}) {
  const map = opts.map ?? new FakeMap();
  (window as unknown as { __ccMap: unknown }).__ccMap = map;
  const onOpenProfile = opts.onOpenProfile ?? vi.fn();
  const view = render(React.createElement(W.MapV2Online.Globe, { onOpenProfile }));
  await act(async () => { window.dispatchEvent(new Event("cc-map-ready")); await vi.advanceTimersByTimeAsync(0); });
  // the index loads, then the first settle (400 ms), then the answer
  await act(async () => { await vi.advanceTimersByTimeAsync(W.MapV2Online.SETTLE_MS + 50); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return { map, view, onOpenProfile };
}
const globeBtn = () => document.querySelector("[data-mv2='globe']") as HTMLButtonElement | null;
const sheet = () => document.querySelector("[data-mv2='online-sheet']") as HTMLElement | null;
const S = () => W.MapV2Strings.online;
const settleMap = async (map: FakeMap) => { act(() => map.emit("moveend")); await act(async () => { await vi.advanceTimersByTimeAsync(W.MapV2Online.SETTLE_MS + 50); }); await act(async () => { await vi.advanceTimersByTimeAsync(0); }); };

beforeEach(() => { vi.useFakeTimers(); backGuards.length = 0; setFlags(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); delete (window as unknown as Record<string, unknown>).__ccMap; });

describe("nothing is drawn when nothing serves the area in view", () => {
  it("adds no control and no button, and the list is never asked for twice", async () => {
    installApi({ [PTA]: { main: [], also_served_by: [] } });
    const { map } = await mountGlobe();
    expect(globeBtn()).toBeNull();
    expect(map.controls).toHaveLength(0); // no empty gap among the zoom and locate buttons
    expect(requests.filter((r) => r.startsWith("/api/v1/serving"))).toHaveLength(1);
  });
  it("is off entirely with the constant off: no button, no control, NO request at all", async () => {
    installApi({ [PTA]: { main: [person(10, "Daily Word Online")], also_served_by: [] } });
    setFlags(false);
    const { map } = await mountGlobe();
    expect(globeBtn()).toBeNull();
    expect(map.controls).toHaveLength(0);
    cleanup();
    expect(requests).toEqual([]);
  });
});

describe("the globe button", () => {
  it("is ONE labelled button among the map's controls, bottom right, with the count and no tap needed to read it", async () => {
    installApi({ [PTA]: { main: [person(10, "Daily Word Online"), person(11, "Faith and Work Podcast")], also_served_by: [alsoP(20, "Midrand Care Vans")] } });
    const { map } = await mountGlobe();
    expect(map.controls).toHaveLength(1);
    expect(map.controls[0]!.pos).toBe("bottom-right");
    expect(map.controls[0]!.ctl.onAdd(map).className).toContain("maplibregl-ctrl-group"); // it shares zoom and locate's look
    const b = globeBtn()!;
    expect(b.getAttribute("aria-label")).toBe(S().button(3));
    expect(b.getAttribute("aria-label")).toBe("Online in this area: 3 listings");
    expect(b.getAttribute("aria-haspopup")).toBe("dialog");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(b.querySelector("[data-mv2='globe-count']")!.textContent).toBe("3");
    expect(b.querySelector("[data-icon='Globe']")).not.toBeNull();
    expect(document.querySelectorAll("[data-mv2='globe']")).toHaveLength(1);
  });
  it("says '1 listing' for one", async () => {
    installApi({ [PTA]: { main: [person(10, "Daily Word Online")], also_served_by: [] } });
    await mountGlobe();
    expect(globeBtn()!.getAttribute("aria-label")).toBe("Online in this area: 1 listing");
  });
  it("asks for the list of ONE area by id: no coordinates are ever sent", async () => {
    installApi({ [PTA]: { main: [person(10, "Daily Word Online")], also_served_by: [] } });
    await mountGlobe();
    const asked = requests.filter((r) => r.startsWith("/api/v1/serving"));
    expect(asked).toEqual(["/api/v1/serving?area=" + PTA]);
    for (const r of requests) expect(r).not.toMatch(/lat|lng|25\.7|28\.2/);
  });
  it("never asks per frame: a hundred moves with the map still moving make no request until it settles", async () => {
    installApi({ [PTA]: { main: [person(10, "Daily Word Online")], also_served_by: [] } });
    const { map } = await mountGlobe();
    const before = requests.length;
    for (let i = 0; i < 100; i++) { act(() => map.emit("moveend")); await act(async () => { await vi.advanceTimersByTimeAsync(20); }); }
    expect(requests.length).toBe(before); // 2 s of continuous moves, nothing asked
    await settleMap(map);
    expect(requests.length).toBe(before); // settled in the same area: still nothing (the answer is fresh)
  });
  it("follows the map: another area asks once and the button changes, and an empty area removes it", async () => {
    installApi({
      [PTA]: { main: [person(10, "Daily Word Online")], also_served_by: [] },
      [CEN]: { main: [person(11, "A"), person(12, "B")], also_served_by: [], name: "Centurion" },
    });
    const { map } = await mountGlobe();
    expect(globeBtn()!.getAttribute("aria-label")).toBe(S().button(1));
    map.center = { lat: -25.8603, lng: 28.1894 };
    await settleMap(map);
    expect(globeBtn()!.getAttribute("aria-label")).toBe(S().button(2));
    map.zoom = 3;                                   // zoomed right out: no area in view at all
    await settleMap(map);
    expect(globeBtn()).toBeNull();
    expect(map.controls).toHaveLength(0);
  });
  it("loads a city's suburbs only when the zoom is close enough for a suburb to count, once", async () => {
    installApi({ [HAT]: { main: [person(10, "Daily Word Online", { served: { id: HAT, name: "Hatfield", level: "suburb" } })], also_served_by: [] }, [PTA]: { main: [], also_served_by: [] } });
    const { map } = await mountGlobe();
    expect(requests.filter((r) => r.includes("parent="))).toEqual([]);
    map.center = { lat: -25.7487, lng: 28.2389 };
    map.zoom = 13;
    await settleMap(map);
    expect(requests.filter((r) => r.includes("parent="))).toEqual(["/api/v1/service-areas?parent=" + PTA]);
    expect(requests).toContain("/api/v1/serving?area=" + HAT);
    expect(globeBtn()).not.toBeNull();
    await settleMap(map);
    expect(requests.filter((r) => r.includes("parent="))).toHaveLength(1);
  });
  it("tidies up: the control and the map listener go when it unmounts", async () => {
    installApi({ [PTA]: { main: [person(10, "Daily Word Online")], also_served_by: [] } });
    const { map, view } = await mountGlobe();
    view.unmount();
    expect(map.controls).toHaveLength(0);
    expect(map.handlers.moveend ?? []).toHaveLength(0);
  });
});

describe("the list", () => {
  const data = {
    [PTA]: {
      main: [
        person(10, "Mobile Food Outreach", { presence: "no_fixed_place" }),
        person(11, "Daily Word Online"),
        person(12, "Faith and Work Podcast", { served: { id: GP, name: "Gauteng", level: "province" } }),
        person(13, "Hatfield Study", { served: { id: HAT, name: "Hatfield", level: "suburb" } }),
      ],
      also_served_by: [alsoP(20, "Midrand Care Vans"), alsoP(21, "Magaliesberg Retreat Team", { centre_name: null, radius_km: 25, distance_km: 41, presence: null })],
    },
  };
  async function open() {
    installApi(data);
    const m = await mountGlobe();
    fireEvent.click(globeBtn()!);
    return m;
  }

  it("opens a dialog titled 'Online in this area' and says what the list is: online or no fixed place, never 'on the map'", async () => {
    await open();
    const dlg = sheet()!;
    expect(dlg.getAttribute("role")).toBe("dialog");
    expect(globeBtn()!.getAttribute("aria-expanded")).toBe("true");
    expect(within(dlg).getByRole("heading", { level: 2 }).textContent).toBe("Online in this area");
    expect(dlg.textContent).toContain("Online or no fixed place · Pretoria · 6 listings");
    expect(dlg.textContent).not.toMatch(/on the map/i);
    expect(JSON.stringify(S())).not.toMatch(/on the map/i);
    expect(document.activeElement).toBe(within(dlg).getByRole("heading", { level: 2 })); // focus moves to the title
  });
  it("groups by how specific the chosen area is, A to Z, each row with the owner's tag and the area", async () => {
    await open();
    const groups = [...document.querySelectorAll("[data-online-group]")].map((g) => g.getAttribute("data-online-group"));
    expect(groups).toEqual(["suburb", "place", "province"]);
    const names = (level: string) => [...document.querySelectorAll(`[data-online-group="${level}"] [data-mv2="row-title"]`)].map((e) => e.textContent);
    expect(names("place")).toEqual(["Daily Word Online", "Mobile Food Outreach"]);
    const mobile = document.querySelector(`[data-online-row="${U(10)}"]`)!;
    expect(mobile.textContent).toContain("No fixed place · Pretoria"); // a mobile ministry is NEVER labelled Online
    expect(mobile.textContent).not.toMatch(/Online/);
    expect(document.querySelector(`[data-online-row="${U(11)}"]`)!.textContent).toContain("Online · Pretoria");
    expect(document.querySelector(`[data-online-row="${U(12)}"]`)!.textContent).toContain("Online · Gauteng");
  });
  it("shows a quiet 'Also reaching this area' under the main list, with the distance and no ranking", async () => {
    await open();
    const also = document.querySelector("[data-online='also']")!;
    expect(also.querySelector("h3")!.textContent).toBe("Also reaching this area");
    const main = document.querySelector("[data-online-group='province']")!;
    expect(main.compareDocumentPosition(also) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // it sits UNDER the main list
    expect(also.textContent).toContain("Within 50 km of Midrand");
    expect(also.textContent).toContain("22.4 km away");
    expect(also.textContent).toContain("Within 25 km of their place"); // a Contributor with a pin: measured from their place
    expect(also.textContent).toContain("Nearest first, then A to Z. No ranking.");
    expect(also.querySelectorAll("li")).toHaveLength(2);
    // the row with no tag (a pinned Contributor) shows none, rather than a wrong one
    expect(document.querySelector(`[data-online-row="${U(21)}"]`)!.textContent).not.toMatch(/Online|No fixed place/);
  });
  it("has no popularity anywhere: no count of followers, no rank, no star", async () => {
    await open();
    expect(sheet()!.textContent).not.toMatch(/follower|popular|top |rank(ed)? #|★|\bstars?\b/i);
  });
  it("every tappable thing is a real button of at least 44 px (the token), and the list is a list", async () => {
    await open();
    expect(document.querySelectorAll("[data-mv2='online-sheet'] ul[role='list']").length).toBeGreaterThan(0);
    for (const b of document.querySelectorAll("[data-mv2='online-sheet'] button")) expect(b.tagName).toBe("BUTTON");
    const css = readFileSync(join(process.cwd(), "src/frontend/assets/map-v2.css"), "utf8");
    expect(css).toMatch(/\.maplibregl-ctrl-group button \{\s*width: var\(--hit\);\s*height: var\(--hit\);/); // the globe is a control-group button: 44 px
    expect(css).toMatch(/\[data-mv2='row'\] \{[^}]*min-height: var\(--hit\);/);
    expect(css).toMatch(/\[data-mv2='icon-btn'\] \{[^}]*width: var\(--hit\);[^}]*height: var\(--hit\);/);
  });
  it("Close, Escape and Back all end it, through ONE Back-guard entry", async () => {
    await open();
    expect(backGuards).toHaveLength(1);
    fireEvent.click(document.querySelector("[data-online='close']")!);
    expect(sheet()).toBeNull();
    expect(backGuards).toHaveLength(0);
    fireEvent.click(globeBtn()!);
    expect(backGuards).toHaveLength(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(sheet()).toBeNull();
    fireEvent.click(globeBtn()!);
    act(() => backGuards[0]!());
    expect(sheet()).toBeNull();
    expect(backGuards).toHaveLength(0);
  });
  it("tapping the globe again closes it, and the button keeps focus after a close", async () => {
    await open();
    fireEvent.click(globeBtn()!);
    expect(sheet()).toBeNull();
    fireEvent.click(globeBtn()!);
    fireEvent.click(document.querySelector("[data-online='close']")!);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(document.activeElement).toBe(globeBtn());
  });
  it("a tap on a row navigates FIRST, then closes (so the Back entry is replaced, not left behind)", async () => {
    const seq: string[] = [];
    installApi(data);
    const m = await mountGlobe({ onOpenProfile: (id) => seq.push("go:" + id + ":sheetOpen=" + !!sheet()) });
    fireEvent.click(globeBtn()!);
    fireEvent.click(document.querySelector(`[data-online-row="${U(11)}"] button`)!);
    seq.push("sheetOpenAfter=" + !!sheet());
    expect(seq).toEqual(["go:" + U(11) + ":sheetOpen=true", "sheetOpenAfter=false"]);
    expect(m.onOpenProfile).toBeDefined();
  });
  it("labels every row for a screen reader with the name, the tag and the area", async () => {
    await open();
    const b = document.querySelector(`[data-online-row="${U(10)}"] button`)!;
    expect(b.getAttribute("aria-label")).toBe("Open Mobile Food Outreach. No fixed place · Pretoria");
  });
});

describe("the sheet's own states", () => {
  it("shows loading, then an error with a retry that asks again, then the list", async () => {
    installApi({ [PTA]: "fail" });
    await mountGlobe();
    // an error means no globe yet (nothing to show), so open the sheet directly the way the button would
    const state = { areaId: PTA, status: "loading", data: null };
    const { rerender } = render(React.createElement(W.MapV2Online.OnlineSheet, { state, onClose: vi.fn(), onPick: vi.fn(), onRetry: vi.fn() }));
    expect(document.querySelector("[data-online='loading']")!.getAttribute("role")).toBe("status");
    const retry = vi.fn();
    rerender(React.createElement(W.MapV2Online.OnlineSheet, { state: { ...state, status: "error" }, onClose: vi.fn(), onPick: vi.fn(), onRetry: retry }));
    expect(document.querySelector("[data-online='error']")!.getAttribute("role")).toBe("alert");
    fireEvent.click(screen.getByText(S().retry));
    expect(retry).toHaveBeenCalled();
  });
  it("says so calmly when the area in view has nobody, while the sheet is open", async () => {
    render(React.createElement(W.MapV2Online.OnlineSheet, { state: { areaId: PTA, status: "ready", data: { ok: true, area: { id: PTA, name: "Pretoria", level: "place" }, main: [], also: [] } }, onClose: vi.fn(), onPick: vi.fn(), onRetry: vi.fn() }));
    expect(screen.getByText(S().empty)).toBeTruthy();
    expect(document.querySelector("[data-online-group]")).toBeNull();
  });
  it("uses the wide layout on a wide screen with a fine pointer", async () => {
    const mq = vi.fn((q: string) => ({ matches: q.includes("min-width: 768px"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal("matchMedia", mq);
    (window as unknown as { matchMedia: unknown }).matchMedia = mq;
    render(React.createElement(W.MapV2Online.OnlineSheet, { state: { areaId: PTA, status: "loading", data: null }, onClose: vi.fn(), onPick: vi.fn(), onRetry: vi.fn() }));
    expect(sheet()!.hasAttribute("data-wide")).toBe(true);
  });
});

describe("wiring", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), "src/frontend", f), "utf8");
  it("the one constant lives in map-v2-lib.jsx and is the only thing the globe asks", () => {
    const lib = read("app/map-v2-lib.jsx");
    expect(lib).toMatch(/const ONLINE_GLOBE_ON = true;/);
    expect(lib).toMatch(/get onlineGlobe\(\) \{ return ONLINE_GLOBE_ON; \}/);
    expect(read("app/map-v2-online.jsx")).toMatch(/const globeOn = \(\) => !!\(window\.MapV2 && window\.MapV2\.onlineGlobe\);/);
  });
  it("home.jsx mounts it, and a tap opens the profile", () => {
    expect(read("app/home.jsx")).toMatch(/React\.createElement\(window\.MapV2Online\.Globe, \{ onOpenProfile: \(id\) => app\.go\('profile', \{ id \}\) \}\)/);
  });
  it("map.jsx tells the globe the map exists", () => {
    expect(read("app/map.jsx")).toMatch(/try \{ window\.dispatchEvent\(new Event\('cc-map-ready'\)\); \}/);
  });
  it("is registered in the page (before the sheet and home) and in the build", () => {
    const html = read("index.html");
    const build = readFileSync(join(process.cwd(), "scripts/build-frontend.js"), "utf8");
    expect(html).toContain("app/map-v2-online.jsx?v=");
    expect(build).toContain("'map-v2-online.jsx'");
    const tag = (f: string) => `app/${f}?v=`;
    expect(html.indexOf(tag("serving-areas-lib.jsx"))).toBeLessThan(html.indexOf(tag("map-v2-online.jsx")));
    expect(html.indexOf(tag("map-v2-strings.jsx"))).toBeLessThan(html.indexOf(tag("map-v2-online.jsx")));
    expect(html.indexOf(tag("map-v2-online.jsx"))).toBeLessThan(html.indexOf(tag("home.jsx")));
  });
});
