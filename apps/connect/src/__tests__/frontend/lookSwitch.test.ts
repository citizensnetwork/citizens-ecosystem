/**
 * The look switch (facelift; the founder's "switch, then flip", 2026-11-11).
 *
 * Connect ships two looks until the new one is flipped on for everyone. This file pins the parts a
 * browser test cannot see cheaply:
 *  1. the bootstrap in `src/frontend/index.html`: which look a visitor gets from the address, the
 *     remembered choice and the default, and that a blocked localStorage never breaks the page;
 *  2. the build half (`scripts/look-bundles.js`): the 2026 file order is derived from the live one,
 *     the default can only be "live" or "2026", and the built page asks for ONE matching bundle;
 *  3. the live look is main's: the files the live bundle loads never mention the new shell, and the
 *     category colours the server shares with it are unchanged;
 *  4. the 2026 look's wiring: the assertions the new shell's own unit tests made, pointed at
 *     `src/frontend/app/look-2026/` (they used to sit in mapV2Discover / mapV2Explore /
 *     mapV2ListingSheet / mapV2Nearby / categories / eventCategoryGroups, which are back to the
 *     live look's wording).
 * e2e/look-switch.spec.ts proves the switch in a real browser.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error a plain CommonJS build script, no types
import looksModule from "../../../scripts/look-bundles.js";
import { CATEGORY_HEX, PLACE_CATEGORY_HEX, CONTRIBUTOR_TYPES, eventCategoryGroup } from "@/lib/categories";

const looks = looksModule as {
  DEFAULT_LOOK_LINE: string;
  LOOK_2026_OVERRIDES: string[];
  LOOK_2026_ADDED: { after: string; files: string[] };
  look2026Order: (live: string[]) => string[];
  defaultLookFromEnv: (env: Record<string, string | undefined>) => string;
  applyLooksToHtml: (html: string, o: { liveBundle: string; look2026Bundle: string; defaultLook: string }) => string;
};

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const html = read("src/frontend/index.html");
const buildScript = read("scripts/build-frontend.js");

/** The live look's file order, read from the build script's own list. */
function liveOrder(): string[] {
  const from = buildScript.indexOf("const appFileOrder = [");
  expect(from).toBeGreaterThan(-1);
  const list = buildScript.slice(from, buildScript.indexOf("];", from));
  return [...list.matchAll(/'([^']+\.jsx)'/g)].map((m) => m[1]!);
}

/** The bootstrap: the one inline script in index.html that carries the default look. */
function bootstrap(defaultLook = "live"): string {
  const page = new DOMParser().parseFromString(html, "text/html");
  const found = Array.from(page.scripts).filter((s) => !s.hasAttribute("src") && (s.textContent || "").includes(looks.DEFAULT_LOOK_LINE));
  expect(found).toHaveLength(1);
  return found[0]!.textContent!.replace(looks.DEFAULT_LOOK_LINE, `var DEFAULT_LOOK = '${defaultLook}';`);
}

type Store = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void };
function memoryStore(initial: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}
const blockedStore: Store = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
  removeItem: () => { throw new Error("blocked"); },
};

/** Run the bootstrap against a stub page; returns the root's data-look ('' when absent). */
function run(opts: { search?: string; store?: Store; defaultLook?: string }): string {
  const attrs: Record<string, string> = {};
  const document = { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } };
  const location = { search: opts.search ?? "" };
  const store = opts.store ?? memoryStore();
  new Function("document", "location", "localStorage", "URLSearchParams", bootstrap(opts.defaultLook))(document, location, store, URLSearchParams);
  return attrs["data-look"] ?? "";
}

describe("the bootstrap in index.html", () => {
  it("gives today's look when nothing was asked or remembered", () => {
    const store = memoryStore();
    expect(run({ store })).toBe("");
    expect(store.data).toEqual({});
  });
  it("?look=2026 turns the new look on and remembers it", () => {
    const store = memoryStore();
    expect(run({ search: "?look=2026", store })).toBe("2026");
    expect(store.data).toEqual({ cc_look: "2026" });
    // the next visit, without the parameter
    expect(run({ store })).toBe("2026");
  });
  it("?look=live turns it off again and forgets it", () => {
    const store = memoryStore({ cc_look: "2026" });
    expect(run({ search: "?look=live", store })).toBe("");
    expect(store.data).toEqual({});
    expect(run({ store })).toBe("");
  });
  it("keeps the parameter among others, and ignores any other value", () => {
    expect(run({ search: "?tab=events&look=2026" })).toBe("2026");
    const store = memoryStore();
    expect(run({ search: "?look=2027", store })).toBe("");
    expect(run({ search: "?look=", store })).toBe("");
    expect(run({ search: "?look=%3Cscript%3E", store })).toBe("");
    expect(store.data).toEqual({});
    // a remembered value that is not a look is ignored too
    expect(run({ store: memoryStore({ cc_look: "purple" }) })).toBe("");
  });
  it("still works for this page when storage is blocked", () => {
    expect(run({ search: "?look=2026", store: blockedStore })).toBe("2026");
    expect(run({ store: blockedStore })).toBe("");
  });
  it("after the flip (default 2026) the new look needs no opt-in and ?look=live opts out", () => {
    const store = memoryStore();
    expect(run({ store, defaultLook: "2026" })).toBe("2026");
    expect(run({ search: "?look=live", store, defaultLook: "2026" })).toBe("");
    expect(store.data).toEqual({ cc_look: "live" });
    expect(run({ store, defaultLook: "2026" })).toBe("");
    expect(run({ search: "?look=2026", store, defaultLook: "2026" })).toBe("2026");
    expect(store.data).toEqual({});
  });
  it("runs in the head before any stylesheet or app script, and touches nothing but the look", () => {
    const at = html.indexOf(looks.DEFAULT_LOOK_LINE);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(html.indexOf("</head>"));
    expect(at).toBeLessThan(html.indexOf("<link "));
    expect(at).toBeLessThan(html.indexOf("<style"));
    const code = bootstrap();
    expect(code).not.toMatch(/cookie|fetch\(|XMLHttpRequest|supabase|sessionStorage|sb-/i);
    expect([...code.matchAll(/localStorage\.(\w+)\(([A-Z_a-z]*)/g)].map((m) => m[1] + ":" + m[2])).toEqual(["removeItem:KEY", "setItem:KEY", "getItem:KEY"]);
  });
});

describe("the build half (scripts/look-bundles.js)", () => {
  it("derives the 2026 order from the live one: eight screens swapped, four files added, nothing else moved", () => {
    const live = liveOrder();
    const order = looks.look2026Order(live);
    expect(looks.LOOK_2026_OVERRIDES).toHaveLength(8);
    expect(order).toHaveLength(live.length + looks.LOOK_2026_ADDED.files.length);
    const withoutAdded = order.filter((f) => !looks.LOOK_2026_ADDED.files.includes(f));
    expect(withoutAdded.map((f) => f.replace(/^look-2026\//, ""))).toEqual(live);
    expect(order.filter((f) => f.startsWith("look-2026/")).map((f) => f.slice(10)).sort()).toEqual([...looks.LOOK_2026_OVERRIDES].sort());
    const after = order.indexOf(looks.LOOK_2026_ADDED.after);
    expect(order.slice(after + 1, after + 5)).toEqual(looks.LOOK_2026_ADDED.files);
    for (const f of order) expect(existsSync(join(process.cwd(), "src/frontend/app", f)), f).toBe(true);
  });
  it("every file in app/look-2026/ is in the 2026 bundle (a stray copy would never load)", async () => {
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(join(process.cwd(), "src/frontend/app/look-2026")).sort()).toEqual([...looks.LOOK_2026_OVERRIDES].sort());
  });
  it("fails loudly when the live list loses a screen it relies on", () => {
    expect(() => looks.look2026Order(liveOrder().filter((f) => f !== "home.jsx"))).toThrow(/home\.jsx/);
  });
  it("the default look is live unless CONNECT_DEFAULT_LOOK is exactly 2026", () => {
    expect(looks.defaultLookFromEnv({})).toBe("live");
    expect(looks.defaultLookFromEnv({ CONNECT_DEFAULT_LOOK: "" })).toBe("live");
    expect(looks.defaultLookFromEnv({ CONNECT_DEFAULT_LOOK: "live" })).toBe("live");
    expect(looks.defaultLookFromEnv({ CONNECT_DEFAULT_LOOK: "2026" })).toBe("2026");
    expect(() => looks.defaultLookFromEnv({ CONNECT_DEFAULT_LOOK: "new" })).toThrow(/CONNECT_DEFAULT_LOOK/);
  });
  it("the built page asks for exactly one bundle, the one matching data-look", () => {
    const built = `<head><script>\n  ${looks.DEFAULT_LOOK_LINE}\n</script></head><body>\n<script src="app/bundle.0123456789.js"></script>\n</body>`;
    const out = looks.applyLooksToHtml(built, { liveBundle: "bundle.0123456789.js", look2026Bundle: "bundle-look2026.abcdef0123.js", defaultLook: "live" });
    expect(out).not.toContain('<script src="app/bundle.0123456789.js"></script>');
    expect(out).toContain(looks.DEFAULT_LOOK_LINE);
    // run the loader the way a parser would, for each look
    const loader = /<script>(document\.write\([\s\S]*?\);)<\/script>/.exec(out)![1]!;
    const written = (look: string | null) => {
      let tag = "";
      new Function("document", loader)({ write: (s: string) => { tag += s; }, documentElement: { getAttribute: () => look } });
      return tag;
    };
    expect(written(null)).toBe('<script src="app/bundle.0123456789.js"></script>');
    expect(written("2026")).toBe('<script src="app/bundle-look2026.abcdef0123.js"></script>');
    expect(written("anything-else")).toBe('<script src="app/bundle.0123456789.js"></script>');
    const flipped = looks.applyLooksToHtml(built, { liveBundle: "bundle.0123456789.js", look2026Bundle: "bundle-look2026.abcdef0123.js", defaultLook: "2026" });
    expect(flipped).toContain("var DEFAULT_LOOK = '2026';");
    expect(flipped).not.toContain(looks.DEFAULT_LOOK_LINE);
  });
  it("refuses a page it cannot rewrite, or a file name that is not a built bundle", () => {
    const ok = { liveBundle: "bundle.0123456789.js", look2026Bundle: "bundle-look2026.abcdef0123.js", defaultLook: "live" };
    expect(() => looks.applyLooksToHtml(`${looks.DEFAULT_LOOK_LINE}`, ok)).toThrow(/exactly one app bundle tag/);
    expect(() => looks.applyLooksToHtml('<script src="app/bundle.0123456789.js"></script>', ok)).toThrow(/DEFAULT_LOOK/);
    expect(() => looks.applyLooksToHtml("", { ...ok, look2026Bundle: 'x.js"><script>alert(1)</script>' })).toThrow(/not a built bundle/);
    expect(() => looks.applyLooksToHtml("", { ...ok, defaultLook: "new" })).toThrow(/unknown look/);
  });
  it("the build script calls it after the main build", () => {
    expect(buildScript).toContain("const { buildLooks } = require('./look-bundles');");
    expect(buildScript.indexOf("buildLooks({")).toBeGreaterThan(buildScript.indexOf("const built = buildFrontend({"));
  });
});

describe("the live look is untouched by the new shell", () => {
  it("no file the live bundle loads, nor the page, mentions the new shell", () => {
    for (const f of liveOrder()) {
      const src = read("src/frontend/app/" + f);
      expect(src, f).not.toMatch(/ConnectChrome|ConnectPreviews|ConnectExplore|ConnectMe|connect-shell\.css/);
    }
    expect(html).not.toMatch(/connect-(chrome|previews|explore|me)\.jsx|connect-shell\.css/);
    expect(liveOrder().some((f) => f.startsWith("connect-") || f.includes("/"))).toBe(false);
  });
  it("the new shell's stylesheet is asked for by the 2026 bundle only, and its look rules name the look", () => {
    expect(read("src/frontend/app/look-2026/map-v2-lib.jsx")).toContain("/assets/connect-shell.css");
    expect(read("src/frontend/app/map-v2-lib.jsx")).not.toContain("connect-shell");
    const css = read("src/frontend/assets/connect-shell.css");
    expect(css).toContain(':root[data-look="2026"]{--map-bg:#edeee5}');
    expect(css).toContain(":root[data-look=\"2026\"][data-theme='dark']{--map-bg:#1d1f1a}");
    // the live values stay where they were
    expect(html).toContain("--map-bg:#EDE5D4;");
    expect(read("src/frontend/assets/map-v2.css")).toMatch(/--map-bg: #292929;/);
  });
  it("the colours and groups the server shares with the live look are main's", () => {
    expect(CATEGORY_HEX["church-services"]).toBe("#F2BD22");
    expect(PLACE_CATEGORY_HEX["churches-ministries"]).toBe("#F2BD22");
    expect(PLACE_CATEGORY_HEX["christian-businesses"]).toBe("#A67C00");
    expect(CONTRIBUTOR_TYPES.find((t) => t.value === "churches-ministries")!.hex).toBe("#F2BD22");
    expect(eventCategoryGroup("members-only")?.label).toBe("Access");
  });
});

describe("the 2026 look's wiring (app/look-2026/)", () => {
  const shell = read("src/frontend/app/look-2026/shell.jsx");
  const home = read("src/frontend/app/look-2026/home.jsx");

  it("Explore and Me come from the new shell; Kingdom Discovery keeps its own page", () => {
    expect(shell).toContain("window.ConnectExplore.Page");
    expect(shell).toContain("case 'kingdom-discovery': return React.createElement(window.KingdomDiscoveryPage);");
    expect(read("src/frontend/app/connect-chrome.jsx")).toContain("app.go('explore')");
  });
  it("the home screen mounts the new map chrome", () => {
    expect(home).toContain("ConnectChrome.MapChrome");
    expect(home).toContain("map-overlay-stack");
  });
  it("the crown rail and glow dock replace the folding nav: no bottom bar is left in the shell", () => {
    expect(shell).toContain("chrome.Nav");
    expect(shell).not.toContain("React.createElement(window.MapV2Nav)");
    expect(shell).not.toContain("BottomNav");
    expect(shell).not.toContain("React.createElement(CreateFab)");
  });
  it("a listing opens in the conveyor and the big preview, not the old half sheet", () => {
    expect(home).toContain("The old half sheet stays closed");
    expect(home).toContain("ConnectPreviews.BigPreview");
    expect(home).toContain("ConnectPreviews.Conveyor");
    expect(home).toContain("onFocus: (item) => { setSelected(item.id); setSelType(item.type); setBig(true); }");
  });
  it("its category data differs from the live look's in six known lines only", () => {
    const live = read("src/frontend/app/data.jsx").split("\n");
    const next = read("src/frontend/app/look-2026/data.jsx").split("\n");
    expect(next).toHaveLength(live.length);
    const changed = next.filter((line, i) => line !== live[i]);
    expect(changed).toHaveLength(6);
    const pick = (id: string, n: number) => changed.filter((l) => l.includes(`id: '${id}'`))[n]!;
    // church: the worship group's purple instead of gold (events, places, contributor types)
    expect(pick("church-services", 0)).toContain("hex: '#7040b5'");
    expect(pick("churches-ministries", 0)).toContain("hex: '#7040b5'");
    expect(pick("churches-ministries", 1)).toContain("hex: '#7040B5'");
    expect(pick("christian-businesses", 0)).toContain("hex: '#687d20'");
    expect(pick("christian-businesses", 1)).toContain("hex: '#687D20'");
    // Members Only sits with Audiences, the group the new map uses
    expect(pick("members-only", 0)).toContain("group: 'Audiences'");
    expect(pick("members-only", 0)).toContain("heading: 'Audiences | Members Only'");
  });
});
