import { test, expect, type Page } from "@playwright/test";
import { mockMapNetwork, mockContributorDetail, openMap, makeSeed, smallSeed, FIXED_NOW, type MapSeed, openPinSheet } from "./support/map-v2";

// Issue 217: the tab bar and its panel are one block. A hairline closes it.
// Nearby, the QR action and View Full Profile stay outside the block.

type C = { id: string; contributor_slug: string; physical_longitude: number; physical_latitude: number; full_name: string };
type Seed = MapSeed & { contributors: C[]; places: { id: string; longitude: number; latitude: number }[]; events: { id: string; longitude: number; latitude: number }[] };

const sheet = (page: Page) => page.locator("[data-mv2='sheet']");
const pinOf = (page: Page, id: string) => page.locator(`.maplibregl-marker[data-cc-id="${id}"]`);

type MapHook = { jumpTo: (o: object, d: object) => void };
const jump = (page: Page, lng: number, lat: number, zoom: number) =>
  page.evaluate(([lo, la, z]) => (window as unknown as { __ccMap: MapHook }).__ccMap.jumpTo({ center: [lo, la], zoom: z }, { originalEvent: {} }), [lng, lat, zoom]);

async function openOn(page: Page, id: string, lng: number, lat: number) {
  await jump(page, lng, lat, 15.5);
  await openPinSheet(page, id);
  await expect(sheet(page)).toBeVisible();
}

const phone = { width: 390, height: 844 };

type Mark = { id: string; text: string } | null;
async function below(page: Page) {
  return page.evaluate(() => {
    const mark = (el: Element | null): Mark => {
      if (!el) return null;
      const n = el as HTMLElement & { __ccStay?: string };
      if (!n.__ccStay) n.__ccStay = Math.random().toString(36).slice(2);
      return { id: n.__ccStay, text: (n.textContent || "").replace(/\s+/g, " ").trim() };
    };
    const panel = document.querySelector("#mv2-panel");
    return {
      rows: [...document.querySelectorAll("[data-mv2='nearby'] [data-near]")].map((el) => mark(el)),
      qr: mark(document.querySelector("[data-mv2='actions-end']")),
      view: mark(document.querySelector("[data-mv2='view-full']")),
      panel: (panel?.textContent || "").replace(/\s+/g, " ").trim(),
    };
  });
}

test.describe("tabbed block on a phone", () => {
  test.use({ viewport: phone });

  test("a contributor with tabs has a 1px divider between the panel and Nearby", async ({ page }) => {
    const seed = smallSeed(FIXED_NOW) as Seed;
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, { gallery: 3 });
    await openMap(page, "/?map=v2", 8);
    const c = seed.contributors[0];
    await openOn(page, c.id, c.physical_longitude, c.physical_latitude);
    await expect(sheet(page).getByRole("tab", { name: "Gallery" })).toBeVisible();

    const block = page.locator("[data-mv2='tabbed']");
    await expect(block).toHaveCount(1);
    await expect(page.locator("#mv2-panel")).toHaveAttribute("tabindex", "0");
    const style = await block.evaluate((el) => {
      const s = getComputedStyle(el);
      const tabs = el.querySelector("[data-mv2='tabs']") as HTMLElement;
      const panel = el.querySelector("#mv2-panel") as HTMLElement;
      const near = document.querySelector("[data-mv2='near-title']") as HTMLElement;
      const ts = getComputedStyle(tabs);
      return {
        width: s.borderBottomWidth,
        line: s.borderBottomStyle,
        color: s.borderBottomColor,
        tabColor: ts.borderBottomColor,
        tabWidth: ts.borderBottomWidth,
        pad: s.paddingBottom,
        gap: near.getBoundingClientRect().top - el.getBoundingClientRect().bottom,
        space: el.getBoundingClientRect().bottom - parseFloat(s.borderBottomWidth) - panel.getBoundingClientRect().bottom,
        overflow: getComputedStyle(document.querySelector("[data-mv2='scroller']") as HTMLElement).overflowY,
        motion: s.transitionDuration,
      };
    });
    expect(style.width).toBe("1px");
    expect(style.line).toBe("solid");
    expect(style.color).toBe("rgba(10, 9, 8, 0.12)");
    expect(style.color).toBe(style.tabColor);
    expect(style.tabWidth).toBe("1px");
    expect(style.pad).toBe("20px");
    expect(style.space).toBeGreaterThan(18);
    expect(style.space).toBeLessThan(22);
    expect(style.gap).toBeGreaterThan(20);
    expect(style.gap).toBeLessThan(28);
    expect(style.overflow).toBe("hidden");
    expect(style.motion).toBe("0s");
    await expect(page.locator("[data-mv2='nearby']")).toBeVisible();
  });

  test("a listing with no tabs, and a Place or an Event, have no block", async ({ page }) => {
    const seed = smallSeed(FIXED_NOW) as Seed;
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, { gallery: 0 });
    await openMap(page, "/?map=v2", 8);
    const c = seed.contributors[2];
    await openOn(page, c.id, c.physical_longitude, c.physical_latitude);
    await expect(page.locator("[data-mv2='empty']")).toBeVisible();
    await expect(page.locator("[data-mv2='tabbed']")).toHaveCount(0);
    await expect(page.locator("[data-mv2='notice']")).toHaveCount(0);

    await page.getByRole("button", { name: "Close details" }).click();
    await expect(sheet(page)).toHaveCount(0);
    const p = seed.places[0];
    await openOn(page, p.id, p.longitude, p.latitude);
    await expect(sheet(page).locator("[data-entity-card='place']")).toBeVisible();
    await expect(page.locator("[data-mv2='tabbed']")).toHaveCount(0);

    await page.getByRole("button", { name: "Close details" }).click();
    const e = seed.events[0];
    await openOn(page, e.id, e.longitude, e.latitude);
    await expect(sheet(page).locator("[data-entity-card='event']")).toBeVisible();
    await expect(page.locator("[data-mv2='tabbed']")).toHaveCount(0);
  });

  test("while photos load the block is already there, and the hairline only moves with the panel", async ({ page }) => {
    const seed = smallSeed(FIXED_NOW) as Seed;
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, { gallery: 6, delayMs: 1200 });
    await openMap(page, "/?map=v2", 8);
    const c = seed.contributors[2];
    await openOn(page, c.id, c.physical_longitude, c.physical_latitude);
    await expect(page.locator("[data-mv2='tabbed'] [data-skeleton]").first()).toBeVisible();
    await expect(page.locator("#mv2-panel")).toHaveCount(0);
    const before = await page.evaluate(() => {
      const block = document.querySelector("[data-mv2='tabbed']") as HTMLElement;
      const anchor = document.querySelector("[data-mv2='bio']") as HTMLElement;
      const grid = block.querySelector("[data-mv2='grid']") as HTMLElement;
      return {
        gap: block.getBoundingClientRect().bottom - anchor.getBoundingClientRect().bottom,
        inner: grid.getBoundingClientRect().height,
      };
    });
    await expect(page.locator("[data-mv2='tile-img']")).toHaveCount(6, { timeout: 5000 });
    await expect(page.locator("[data-mv2='tabbed']")).toHaveCount(1);
    const after = await page.evaluate(() => {
      const block = document.querySelector("[data-mv2='tabbed']") as HTMLElement;
      const anchor = document.querySelector("[data-mv2='bio']") as HTMLElement;
      const grid = block.querySelector("[data-mv2='grid']") as HTMLElement;
      return {
        gap: block.getBoundingClientRect().bottom - anchor.getBoundingClientRect().bottom,
        inner: grid.getBoundingClientRect().height,
        border: getComputedStyle(block).borderBottomWidth,
      };
    });
    const extra = Math.abs(after.gap - before.gap - (after.inner - before.inner));
    expect(extra, `hairline ${after.gap - before.gap}px, panel ${after.inner - before.inner}px`).toBeLessThanOrEqual(4);
    expect(after.border).toBe("1px");
  });

  test("switching tabs changes only the panel; Nearby, QR and View Full Profile stay the same nodes", async ({ page }) => {
    const seed = smallSeed(FIXED_NOW) as Seed;
    const c = seed.contributors[0];
    const posts = [
      { id: "n1", contributor_id: c.id, title: "Older update", body: "Last week we cleaned the park.", image_url: null, post_date: "2026-10-03", created_at: new Date(FIXED_NOW - 7 * 86_400_000).toISOString() },
      { id: "n2", contributor_id: c.id, title: "Fresh update", body: "Doors open at nine.", image_url: null, post_date: "2026-10-10", created_at: new Date(FIXED_NOW - 3 * 3_600_000).toISOString() },
    ];
    await page.addInitScript((rows) => {
      const chain = (table: string): unknown =>
        new Proxy(function () {}, {
          get: (_t, p) => (p === "then" ? (res: (v: unknown) => void) => res({ data: table === "news_posts" ? rows : [], error: null }) : () => chain(table)),
          apply: () => chain(table),
        });
      (window as unknown as { CC_SUPABASE: unknown }).CC_SUPABASE = {
        from: chain,
        auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: null } }) },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel() {},
      };
    }, posts);
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, { gallery: 3 });
    await openMap(page, "/?map=v2", 8);
    await openOn(page, c.id, c.physical_longitude, c.physical_latitude);
    await expect(sheet(page).getByRole("tab")).toHaveText(["Events", "News", "Gallery"]);
    await expect(page.locator("[data-mv2='nearby'] [data-near]").first()).toBeVisible();

    const first = await below(page);
    expect(first.rows.length).toBeGreaterThan(0);
    expect(first.qr).not.toBeNull();
    expect(first.view?.text).toContain("View Full Profile");
    expect(first.panel).toContain("Fixture Gathering 1");

    await sheet(page).getByRole("tab", { name: "News" }).click();
    await expect(page.locator("#mv2-panel")).toContainText("Fresh update");
    const second = await below(page);
    expect(second.rows).toEqual(first.rows);
    expect(second.qr).toEqual(first.qr);
    expect(second.view).toEqual(first.view);
    expect(second.panel).not.toBe(first.panel);

    await sheet(page).getByRole("tab", { name: "Gallery" }).click();
    await expect(page.locator("#mv2-panel img").first()).toBeVisible();
    const third = await below(page);
    expect(third.rows).toEqual(first.rows);
    expect(third.qr).toEqual(first.qr);
    expect(third.view).toEqual(first.view);
    expect(third.panel).not.toContain("Fresh update");
  });

  test("with nothing nearby the hairline still sits above the QR action", async ({ page }) => {
    const seed = makeSeed({ contributors: 1, places: 0, events: 0, now: FIXED_NOW, spread: 0.02, seed: 7 }) as Seed;
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, { gallery: 3 });
    await openMap(page, "/?map=v2", 1);
    const c = seed.contributors[0];
    await openOn(page, c.id, c.physical_longitude, c.physical_latitude);
    await expect(page.locator("#mv2-panel img").first()).toBeVisible();
    await expect(page.locator("[data-mv2='nearby']")).toHaveCount(0);
    const order = await page.evaluate(() => {
      const block = document.querySelector("[data-mv2='tabbed']")!.getBoundingClientRect();
      const qr = document.querySelector("[data-mv2='actions-end']")!.getBoundingClientRect();
      const view = document.querySelector("[data-mv2='view-full']")!.getBoundingClientRect();
      return { block: block.bottom, qr: qr.top, view: view.top };
    });
    expect(order.qr).toBeGreaterThanOrEqual(order.block - 1);
    expect(order.view).toBeGreaterThan(order.qr);
  });
});

test.describe("tabbed block sticks only while its scroller scrolls", () => {
  test("at full snap the bar stays, then leaves with the block, and a new tab starts under the bar", async ({ page }) => {
    await page.setViewportSize(phone);
    const seed = makeSeed({ contributors: 3, places: 8, events: 2, now: FIXED_NOW, spread: 0.02, seed: 7 }) as Seed;
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, { gallery: 12 });
    await openMap(page, "/?map=v2", 10);
    const c = seed.contributors[0];
    await openOn(page, c.id, c.physical_longitude, c.physical_latitude);
    await page.locator("[data-mv2='handle']").click();
    await expect(sheet(page)).toHaveAttribute("data-snap", "full");
    await expect.poll(() => sheet(page).evaluate((e) => e.getBoundingClientRect().top), { timeout: 3000 }).toBeCloseTo(844 * 0.1, -1);
    await page.getByRole("tab", { name: "Gallery" }).click();
    await expect(page.locator("#mv2-panel img")).toHaveCount(12);

    const scroller = page.locator("[data-mv2='scroller']");
    // Nearby is one row, a card tall, so there is less under the block than when it was a stack (and a runner's fonts
    // make it shorter still). Give the scroller room up front, so the block can scroll all the way out of view: the
    // bar sticking and then leaving with its block is what is under test.
    await scroller.evaluate((el) => {
      (el as HTMLElement).style.paddingBottom = "900px";
    });
    const atTop = await scroller.evaluate((el) => {
      const sc = el as HTMLElement;
      const tabs = sc.querySelector("[data-mv2='tabs']") as HTMLElement;
      const block = sc.querySelector("[data-mv2='tabbed']") as HTMLElement;
      return {
        dataTop: sc.hasAttribute("data-top"),
        overflow: getComputedStyle(sc).overflowY,
        behavior: getComputedStyle(sc).scrollBehavior,
        sticky: getComputedStyle(tabs).position,
        blockOverflow: getComputedStyle(block).overflowY,
        touch: getComputedStyle(tabs).touchAction === getComputedStyle(sc).touchAction,
      };
    });
    expect(atTop.dataTop).toBe(true);
    expect(atTop.overflow).toBe("auto");
    expect(atTop.behavior).toBe("auto");
    expect(atTop.sticky).toBe("sticky");
    expect(atTop.blockOverflow).toBe("visible");
    expect(atTop.touch).toBe(true);

    await scroller.evaluate((el) => {
      const sc = el as HTMLElement;
      const block = sc.querySelector("[data-mv2='tabbed']") as HTMLElement;
      sc.scrollTop += block.getBoundingClientRect().top - sc.getBoundingClientRect().top + 140;
    });
    const stuck = await scroller.evaluate((el) => {
      const sc = el as HTMLElement;
      const tabs = sc.querySelector("[data-mv2='tabs']") as HTMLElement;
      const tile = sc.querySelector("#mv2-panel img") as HTMLElement;
      return {
        dataTop: sc.hasAttribute("data-top"),
        gap: tabs.getBoundingClientRect().top - sc.getBoundingClientRect().top,
        tile: tile.getBoundingClientRect().top,
      };
    });
    expect(stuck.dataTop).toBe(false);
    expect(stuck.gap).toBeGreaterThanOrEqual(-1);
    expect(stuck.gap).toBeLessThanOrEqual(12);
    await scroller.evaluate((el) => {
      (el as HTMLElement).scrollTop += 70;
    });
    const moved = await scroller.evaluate((el) => {
      const sc = el as HTMLElement;
      const tabs = sc.querySelector("[data-mv2='tabs']") as HTMLElement;
      const tile = sc.querySelector("#mv2-panel img") as HTMLElement;
      return {
        gap: tabs.getBoundingClientRect().top - sc.getBoundingClientRect().top,
        tile: tile.getBoundingClientRect().top,
      };
    });
    expect(Math.abs(moved.gap - stuck.gap)).toBeLessThan(2);
    expect(stuck.tile - moved.tile).toBeGreaterThan(50);

    await scroller.evaluate((el) => {
      const sc = el as HTMLElement;
      const block = sc.querySelector("[data-mv2='tabbed']") as HTMLElement;
      sc.scrollTop += block.getBoundingClientRect().bottom - sc.getBoundingClientRect().top + 16;
    });
    const gone = await scroller.evaluate((el) => {
      const sc = el as HTMLElement;
      const tabs = sc.querySelector("[data-mv2='tabs']") as HTMLElement;
      return tabs.getBoundingClientRect().top - sc.getBoundingClientRect().top;
    });
    expect(gone).toBeLessThan(-4);

    const before = await below(page);
    await scroller.evaluate((el) => {
      const sc = el as HTMLElement;
      const block = sc.querySelector("[data-mv2='tabbed']") as HTMLElement;
      sc.scrollTop += block.getBoundingClientRect().top - sc.getBoundingClientRect().top + 140;
    });
    await page.getByRole("tab", { name: "Events" }).click();
    await expect(page.locator("#mv2-panel")).toContainText("Fixture Gathering 1");
    const after = await below(page);
    expect(after.rows).toEqual(before.rows);
    expect(after.qr).toEqual(before.qr);
    expect(after.view).toEqual(before.view);
    const placed = await scroller.evaluate((el) => {
      const sc = el as HTMLElement;
      const tabs = sc.querySelector("[data-mv2='tabs']") as HTMLElement;
      const first = sc.querySelector("#mv2-panel")?.firstElementChild as HTMLElement;
      const row = sc.querySelector("#mv2-panel [data-mv2='row-title']") as HTMLElement;
      const near = sc.querySelector("[data-mv2='near-title']") as HTMLElement;
      const sr = sc.getBoundingClientRect();
      const rr = row.getBoundingClientRect();
      return {
        // the sort bar is the panel's first item; the tabs' own margin sits between them
        under: first.getBoundingClientRect().top - tabs.getBoundingClientRect().bottom,
        inView: rr.top > sr.top && rr.bottom < sr.bottom,
        nearBelow: near.getBoundingClientRect().top > rr.bottom,
      };
    });
    expect(placed.under).toBeGreaterThan(8);
    expect(placed.under).toBeLessThan(20);
    expect(placed.inView).toBe(true);
    expect(placed.nearBelow).toBe(true);
  });

  test("in the wide panel the bar sticks and leaves with the block", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const seed = makeSeed({ contributors: 3, places: 8, events: 2, now: FIXED_NOW, spread: 0.02, seed: 7 }) as Seed;
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, { gallery: 12 });
    await openMap(page, "/?map=v2", 10);
    const c = seed.contributors[0];
    await openOn(page, c.id, c.physical_longitude, c.physical_latitude);
    await expect(sheet(page)).toHaveAttribute("data-wide", "1");
    await expect(page.locator("[data-mv2='handle']")).toHaveCount(0);
    await page.getByRole("tab", { name: "Gallery" }).click();
    await expect(page.locator("#mv2-panel img")).toHaveCount(12);
    const scroller = page.locator("[data-mv2='scroller']");
    // Nearby is one row, a card tall, so there is less under the block than when it was a stack (and a runner's fonts
    // make it shorter still). Give the scroller room up front, so the block can scroll all the way out of view: the
    // bar sticking and then leaving with its block is what is under test.
    await scroller.evaluate((el) => {
      (el as HTMLElement).style.paddingBottom = "900px";
    });
    expect(await scroller.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");

    await scroller.evaluate((el) => {
      const sc = el as HTMLElement;
      const block = sc.querySelector("[data-mv2='tabbed']") as HTMLElement;
      sc.scrollTop += block.getBoundingClientRect().top - sc.getBoundingClientRect().top + 120;
    });
    const stuck = await scroller.evaluate((el) => {
      const sc = el as HTMLElement;
      const tabs = sc.querySelector("[data-mv2='tabs']") as HTMLElement;
      return tabs.getBoundingClientRect().top - sc.getBoundingClientRect().top;
    });
    expect(stuck).toBeGreaterThanOrEqual(-1);
    expect(stuck).toBeLessThanOrEqual(12);

    await scroller.evaluate((el) => {
      const sc = el as HTMLElement;
      const block = sc.querySelector("[data-mv2='tabbed']") as HTMLElement;
      sc.scrollTop += block.getBoundingClientRect().bottom - sc.getBoundingClientRect().top + 16;
    });
    const gone = await scroller.evaluate((el) => {
      const sc = el as HTMLElement;
      const tabs = sc.querySelector("[data-mv2='tabs']") as HTMLElement;
      return tabs.getBoundingClientRect().top - sc.getBoundingClientRect().top;
    });
    expect(gone).toBeLessThan(-4);

    await scroller.evaluate((el) => {
      const sc = el as HTMLElement;
      const block = sc.querySelector("[data-mv2='tabbed']") as HTMLElement;
      sc.scrollTop += block.getBoundingClientRect().top - sc.getBoundingClientRect().top + 120;
    });
    await page.getByRole("tab", { name: "Events" }).click();
    await expect(page.locator("#mv2-panel")).toContainText("Fixture Gathering 1");
    const placed = await scroller.evaluate((el) => {
      const sc = el as HTMLElement;
      const tabs = sc.querySelector("[data-mv2='tabs']") as HTMLElement;
      const first = sc.querySelector("#mv2-panel")?.firstElementChild as HTMLElement;
      const row = sc.querySelector("#mv2-panel [data-mv2='row-title']") as HTMLElement;
      const sr = sc.getBoundingClientRect();
      const rr = row.getBoundingClientRect();
      return {
        under: first.getBoundingClientRect().top - tabs.getBoundingClientRect().bottom,
        inView: rr.top > sr.top && rr.bottom < sr.bottom,
      };
    });
    expect(placed.under).toBeGreaterThan(8);
    expect(placed.under).toBeLessThan(20);
    expect(placed.inView).toBe(true);
  });
});

test.describe("tabbed block keyboard and dark look", () => {
  test.use({ viewport: phone });

  test("Tab reaches the panel before the note's report control, and the focus ring uses the focus tokens", async ({ page }) => {
    const seed = smallSeed(FIXED_NOW) as Seed;
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, {
      gallery: 0,
      moments: [{
        id: "m1",
        body: "A note from today",
        image_url: null,
        created_at: new Date(FIXED_NOW - 3_600_000).toISOString(),
        expires_at: new Date(FIXED_NOW + 20 * 3_600_000).toISOString(),
      }],
    });
    await openMap(page, "/?map=v2", 8);
    const c = seed.contributors[2];
    await openOn(page, c.id, c.physical_longitude, c.physical_latitude);
    await expect(sheet(page).getByRole("tab")).toHaveText(["Today"]);
    await expect(page.locator("#mv2-panel")).toContainText("A note from today");
    await expect(page.locator("#mv2-panel").getByRole("button", { name: "More options" })).toHaveCount(1);
    await page.getByRole("tab", { name: "Today" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#mv2-panel")).toBeFocused();
    const ring = await page.locator("#mv2-panel").evaluate((el) => {
      const s = getComputedStyle(el);
      const probe = document.createElement("div");
      probe.style.color = "var(--focus-ring)";
      document.body.appendChild(probe);
      const expected = getComputedStyle(probe).color;
      probe.remove();
      return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, color: s.outlineColor, expected };
    });
    expect(ring.style).toBe("solid");
    expect(ring.width).toBe("2px");
    expect(ring.offset).toBe("2px");
    expect(ring.color).toBe(ring.expected);
  });

  test("the dark look uses the dark divider for the hairline", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const seed = smallSeed(FIXED_NOW) as Seed;
    await mockMapNetwork(page, seed);
    await mockContributorDetail(page, seed, { gallery: 1 });
    await openMap(page, "/?map=v2", 8);
    const c = seed.contributors[0];
    await openOn(page, c.id, c.physical_longitude, c.physical_latitude);
    await expect(page.locator("[data-mv2='tabbed']")).toHaveCount(1);
    const color = await page.locator("[data-mv2='tabbed']").evaluate((el) => {
      return {
        theme: document.documentElement.getAttribute("data-theme"),
        hair: getComputedStyle(el).borderBottomColor,
        bar: getComputedStyle(el.querySelector("[data-mv2='tabs']") as HTMLElement).borderBottomColor,
        fill: getComputedStyle(el.querySelector("[data-mv2='tabs']") as HTMLElement).backgroundColor,
      };
    });
    expect(color.theme).toBe("dark");
    expect(color.hair).toBe("rgba(247, 244, 238, 0.14)");
    expect(color.hair).toBe(color.bar);
    expect(color.fill).toBe("rgb(26, 23, 20)");
  });
});
