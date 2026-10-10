import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, openMap, smallSeed, FIXED_NOW } from "./support/map-v2";
import { goTo } from "./support/app-hooks";

// ════════════════════════════════════════════════════════════════════
//  Map v2 (tracker docs/MAP_UX_TRACKER.md), everything behind `?map=v2`.
//  Hermetic: the same fake network as the other map specs (no real Supabase
//  or MapTiler), clock frozen. This file grows with each Phase 1 item; the
//  describe blocks are named after the item they guard.
// ════════════════════════════════════════════════════════════════════

type Row = Record<string, unknown>;
type Seed = { contributors: Row[]; places: Row[]; events: Row[] };

const seedWith = (mutate: (s: Seed) => void) => {
  const s = smallSeed(FIXED_NOW) as Seed;
  mutate(s);
  return s;
};
type MapHook = { jumpTo: (o: object, d: object) => void; once: (e: string, f: () => void) => void; isMoving: () => boolean; loaded: () => boolean };
const jump = (page: Page, lng: number, lat: number, zoom: number) =>
  page.evaluate(([lo, la, z]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: z }, { originalEvent: {} }), [lng, lat, zoom]);
const idle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((res) => {
        const m = (window as unknown as { __ccMap: MapHook }).__ccMap;
        if (!m.isMoving() && m.loaded()) return res();
        m.once("idle", () => res());
        setTimeout(res, 3000);
      }),
  );

test.describe("P1-01 the ?map=v2 flag", () => {
  test("flag off (the default): no Map v2 stylesheet, no badge, nothing set on the page", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (r) => requested.push(r.url()));
    await mockMapNetwork(page);
    await openMap(page, "/", 8);

    expect(requested.filter((u) => u.includes("map-v2"))).toEqual([]);
    await expect(page.locator("#cc-map-v2-badge")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBeNull();
    expect(await page.evaluate(() => (window as unknown as { isMapV2: () => boolean }).isMapV2())).toBe(false);
  });

  test("?map=v2 turns it on, shows the badge, loads the tokens and defaults to the LIGHT look", async ({ page }) => {
    await mockMapNetwork(page);
    const css = page.waitForResponse((r) => r.url().includes("/assets/map-v2.css") && r.ok());
    await openMap(page, "/?map=v2", 8);
    await css;

    await expect(page.locator("#cc-map-v2-badge")).toHaveText("map v2");
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("light");
    // the token file is really applied: --accent resolves to gold
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim())).toBe("#c9a84c");
    expect(await page.evaluate(() => localStorage.getItem("cc_map_v2"))).toBe("v2");
  });

  test("the flag survives a reload and a screen change that rewrites the address bar", async ({ page }) => {
    await mockMapNetwork(page);
    await openMap(page, "/?map=v2", 8);

    // go() rebuilds the URL from the route table, so ?map=v2 is gone from the address bar...
    await goTo(page, "kingdom-discovery");
    await expect(page.locator('[data-screen="kingdom-discovery"]')).toBeVisible();
    expect(new URL(page.url()).search).toBe("");
    // ...and a plain reload still has the flag on, from storage.
    await page.reload();
    await expect(page.locator("#cc-map-v2-badge")).toHaveText("map v2");
  });

  test("?map=v1 turns it off and forgets it", async ({ page }) => {
    await mockMapNetwork(page);
    await openMap(page, "/?map=v2", 8);
    await expect(page.locator("#cc-map-v2-badge")).toBeVisible();

    await page.goto("/?map=v1");
    await page.waitForSelector('[data-screen="discover"]');
    await expect(page.locator("#cc-map-v2-badge")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("cc_map_v2"))).toBeNull();
  });
});

test.describe("P1-03 motion tokens and reduced motion", () => {
  test("durations are 120 / 200 / 320 ms, and collapse to 0 under prefers-reduced-motion", async ({ page }) => {
    await mockMapNetwork(page);
    await openMap(page, "/?map=v2", 8);
    const read = () =>
      page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        return ["--dur-fast", "--dur-base", "--dur-slow"].map((n) => cs.getPropertyValue(n).trim());
      });
    expect(await read()).toEqual(["120ms", "200ms", "320ms"]);

    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await read()).toEqual(["0ms", "0ms", "0ms"]);
  });
});

test.describe("P1-04 the pin (flag on)", () => {
  test("a Contributor pin is a glyph pin below zoom 15 and a logo pin at and above it", async ({ page }) => {
    const seed = smallSeed(FIXED_NOW) as Seed;
    await mockMapNetwork(page, seed);
    await openMap(page, "/?map=v2", 8);
    const c0 = seed.contributors[0] as { physical_longitude: number; physical_latitude: number };
    const pin = page.locator(".mv2-pin--contributor").first();

    await jump(page, c0.physical_longitude, c0.physical_latitude, 12);
    await idle(page);
    await expect(pin.locator("[data-mv2='logo']")).not.toHaveAttribute("src", /./); // not even requested below the photo zoom
    expect(await pin.locator("[data-mv2='logo-wrap']").evaluate((e) => getComputedStyle(e).opacity)).toBe("0");
    await expect(pin.locator("[data-mv2='glyph']")).toBeVisible();

    await jump(page, c0.physical_longitude, c0.physical_latitude, 15.5);
    await idle(page);
    await expect(pin).toHaveClass(/is-loaded/);
    await expect.poll(() => pin.locator("[data-mv2='logo-wrap']").evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
  });

  test("the selected pin always shows its logo, even at a low zoom, and grows 1.6x", async ({ page }) => {
    const seed = smallSeed(FIXED_NOW) as Seed;
    await mockMapNetwork(page, seed);
    await openMap(page, "/?map=v2", 8);
    const c0 = seed.contributors[0] as { physical_longitude: number; physical_latitude: number; id: string };
    await jump(page, c0.physical_longitude, c0.physical_latitude, 12);
    await idle(page);
    const wrap = page.locator(`.maplibregl-marker[data-cc-id="${c0.id}"]`);
    await wrap.focus();
    await page.keyboard.press("Enter");
    const pin = wrap.locator(".mv2-pin");
    await expect(pin).toHaveClass(/is-selected/);
    await expect(pin).toHaveClass(/is-loaded/);
    await expect.poll(() => pin.locator("[data-mv2='logo-wrap']").evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
    await expect.poll(() => pin.locator("[data-mv2='body']").evaluate((e) => new DOMMatrix(getComputedStyle(e).transform).a)).toBeCloseTo(1.6, 2);
  });

  test("every pin is a labelled, focusable control", async ({ page }) => {
    await mockMapNetwork(page);
    await openMap(page, "/?map=v2", 8);
    const markers = page.locator(".maplibregl-marker");
    const n = await markers.count();
    for (let i = 0; i < n; i++) {
      const m = markers.nth(i);
      await expect(m).toHaveAttribute("role", "button");
      await expect(m).toHaveAttribute("tabindex", "0");
      await expect(m).toHaveAttribute("aria-label", /\S+, \S+/); // "{name}, {category}"
    }
    const labels = await markers.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(labels).toContain("Fixture Fellowship 1, Church");
    expect(labels.some((l) => l && l.startsWith("Fixture Gathering 1, "))).toBe(true);
    expect(labels.some((l) => l && l.startsWith("Fixture Place 1, "))).toBe(true);
  });

  test("a keyboard user can open a pin with Enter and sees a focus ring on it", async ({ page }) => {
    await mockMapNetwork(page);
    await openMap(page, "/?map=v2", 8);
    const first = page.locator(".maplibregl-marker").first();
    await first.focus();
    await page.keyboard.press("Tab"); // move away and back with the keyboard so :focus-visible applies
    await page.keyboard.press("Shift+Tab");
    const outline = await first.evaluate((e) => getComputedStyle(e).outlineStyle + " " + getComputedStyle(e).outlineWidth);
    expect(outline).toBe("solid 2px");
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-entity-card]")).toBeVisible(); // the v1 card until the sheet lands (P1-06)
  });

  test("the tap target of every pin is at least 44 x 44 CSS px", async ({ page }) => {
    await mockMapNetwork(page);
    await openMap(page, "/?map=v2", 8);
    await idle(page);
    // the hit area is a transparent ::before, so measure by hit-testing 21 px either side of each pin's centre
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll<HTMLElement>(".maplibregl-marker").forEach((m) => {
        const pin = m.querySelector<HTMLElement>("[data-mv2='body']");
        if (!pin) return;
        const r = pin.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        for (const [dx, dy] of [[-21, 0], [21, 0], [0, -21], [0, 21]]) {
          const hit = document.elementFromPoint(cx + dx, cy + dy);
          if (!hit || hit.closest(".maplibregl-marker") !== m) out.push(`${m.getAttribute("aria-label")} @${dx},${dy}`);
        }
      });
      return out;
    });
    expect(bad).toEqual([]);
  });

  test("only transform and opacity animate; reduced motion removes the transitions", async ({ page }) => {
    await mockMapNetwork(page);
    await openMap(page, "/?map=v2", 8);
    const read = () =>
      page.evaluate(() => {
        const body = getComputedStyle(document.querySelector(".mv2-pin--contributor [data-mv2='body']") as Element);
        const marker = getComputedStyle(document.querySelector(".mv2-pin") as Element);
        return { body: [body.transitionProperty, body.transitionDuration], marker: [marker.transitionProperty, marker.transitionDuration] };
      });
    expect(await read()).toEqual({ body: ["transform", "0.2s"], marker: ["opacity", "0.12s"] });
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await read()).toEqual({ body: ["transform", "0s"], marker: ["opacity", "0s"] });
  });

  test("two pins on the same spot show a +1 on the one with an upcoming event", async ({ page }) => {
    const seed = seedWith((s) => {
      // put the first Place right under the first Event
      s.places[0].latitude = s.events[0].latitude;
      s.places[0].longitude = s.events[0].longitude;
    });
    await mockMapNetwork(page, seed);
    await openMap(page, "/?map=v2", 8);
    const ev = seed.events[0] as { longitude: number; latitude: number; id: string };
    await jump(page, ev.longitude, ev.latitude, 15.5);
    await idle(page);
    // the badge is worked out 150 ms after the map goes quiet, so poll
    await expect.poll(() => page.locator("[data-mv2='count'][data-on]").evaluateAll((els) => els.map((e) => e.textContent))).toEqual(["+1"]);
    // ...and it is the Event's pin (it has an upcoming event), not the Place's
    await expect(page.locator(`.maplibregl-marker[data-cc-id="${ev.id}"] [data-mv2='count'][data-on]`)).toHaveText("+1");
  });

  test("two names that would collide: only one label shows, and it is the sooner event's", async ({ page }) => {
    const seed = seedWith((s) => {
      // two events on the same spot, a few metres apart: their labels land on top of each other
      s.events[1].latitude = s.events[0].latitude;
      s.events[1].longitude = (s.events[0].longitude as number) + 0.00004;
    });
    await mockMapNetwork(page, seed);
    await openMap(page, "/?map=v2", 8);
    const [e0, e1] = seed.events as { longitude: number; latitude: number; id: string }[];
    await jump(page, e0.longitude, e0.latitude, 16);
    await idle(page);
    await expect
      .poll(() =>
        page.evaluate(
          (ids) => ids.map((id) => !document.querySelector(`.maplibregl-marker[data-cc-id="${id}"] [data-mv2='label']`)?.hasAttribute("data-off")),
          [e0.id, e1.id],
        ),
      )
      .toEqual([true, false]); // events[0] starts first, so it keeps its label
  });

  test("the pin hooks other specs rely on are all there: contributor, event and place", async ({ page }) => {
    await mockMapNetwork(page);
    await openMap(page, "/?map=v2", 8);
    for (const kind of ["contributor", "event", "place"]) await expect(page.locator(`[data-cc-pin="${kind}"]`).first()).toBeAttached();
  });
});

test.describe("flag off: v1 pins are untouched", () => {
  test("no Map v2 class, role or tabindex on any marker, and the v1 logo pin is still drawn at every zoom", async ({ page }) => {
    await mockMapNetwork(page);
    await openMap(page, "/", 8);
    expect(await page.locator(".mv2-marker, .mv2-pin").count()).toBe(0);
    expect(await page.locator(".maplibregl-marker[role]").count()).toBe(0);
    await expect(page.locator('[data-cc-pin="contributor-logo"]').first()).toBeAttached();
  });
});

test.describe("E23 and the 12.3 states", () => {
  test("flag on: the locate and zoom buttons are 44 px; flag off: they keep their v1 size", async ({ page }) => {
    await mockMapNetwork(page);
    await openMap(page, "/?map=v2", 8);
    const size = () => page.locator(".maplibregl-ctrl-group button").evaluateAll((els) => els.map((e) => [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]));
    for (const wh of await size()) expect(wh).toEqual([44, 44]);
    await page.goto("/?map=v1");
    await page.waitForSelector('[data-screen="discover"]');
    for (const wh of await size()) expect(wh).toEqual([29, 29]);
  });

  test("an action has a hover state and a pressed state on top of its focus ring", async ({ page }) => {
    const seed = smallSeed(FIXED_NOW) as Seed;
    await mockMapNetwork(page, seed);
    await openMap(page, "/?map=v2", 8);
    const c = seed.contributors[0] as { id: string; physical_longitude: number; physical_latitude: number };
    await jump(page, c.physical_longitude, c.physical_latitude, 15.5);
    await page.locator(`.maplibregl-marker[data-cc-id="${c.id}"]`).click({ force: true });
    const share = page.locator("[data-mv2='sheet']").getByRole("button", { name: "Share" });
    await expect(share).toBeVisible();
    await share.hover();
    await expect(share).toHaveCSS("border-top-color", "rgb(139, 105, 20)"); // --accent-ink on hover
    await page.mouse.down();
    await expect.poll(() => share.evaluate((e) => getComputedStyle(e).transform)).not.toBe("none"); // pressed: scale(0.97)
    await page.mouse.up();
  });
});
