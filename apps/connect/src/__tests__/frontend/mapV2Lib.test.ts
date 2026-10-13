/**
 * Map v2 foundations (`src/frontend/app/map-v2-lib.jsx`, tracker P1-01 / P1-03):
 * the `?map=v2` flag, the motion constants and the map look. The file is
 * an IIFE that publishes `window.isMapV2` / `window.MapV2`, so it is evaluated
 * against a stub window like the other frontend modules (no DOM here, which also
 * means the stylesheet mount is skipped, exactly the "does nothing without
 * a document" path).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFrontend } from "./support/loadFrontend";

type MapV2 = {
  isOn: () => boolean;
  motion: { fast: number; base: number; slow: number; enter: string; exit: string };
  dur: (n: "fast" | "base" | "slow") => number;
  prefersReducedMotion: () => boolean;
  resolvedTheme: () => string;
  FLAG_KEY: string;
  CSS_HREF: string;
};

function memoryStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

function boot(opts: { search?: string; storage?: ReturnType<typeof memoryStorage> | "blocked"; reduced?: boolean; dark?: boolean } = {}) {
  const storage = opts.storage === "blocked" ? null : (opts.storage ?? memoryStorage());
  const win: Record<string, unknown> = {
    location: { search: opts.search ?? "" },
    matchMedia: (q: string) => ({
      matches: q.includes("reduced-motion") ? !!opts.reduced : q.includes("prefers-color-scheme: dark") ? !!opts.dark : false,
    }),
    dispatchEvent: () => true,
  };
  if (opts.storage === "blocked") {
    // Safari private mode and blocked site data throw on ACCESS to localStorage.
    Object.defineProperty(win, "localStorage", {
      get() {
        throw new Error("SecurityError");
      },
    });
  } else {
    win.localStorage = storage;
  }
  loadFrontend("map-v2-lib.jsx", win);
  return { win, storage, api: win.MapV2 as MapV2, isMapV2: win.isMapV2 as () => boolean };
}

/**
 * The same source with DEFAULT_ON flipped to false: what "roll everyone back" means. The replace is
 * asserted, so this fails (rather than silently testing the default) if the constant is renamed.
 */
function bootRolledBack(opts: { search?: string; storage?: ReturnType<typeof memoryStorage> } = {}) {
  const src = readFileSync(join(process.cwd(), "src/frontend/app/map-v2-lib.jsx"), "utf8");
  const off = src.replace("const DEFAULT_ON = true;", "const DEFAULT_ON = false;");
  expect(off).not.toBe(src);
  const storage = opts.storage ?? memoryStorage();
  const win: Record<string, unknown> = {
    location: { search: opts.search ?? "" },
    matchMedia: () => ({ matches: false }),
    dispatchEvent: () => true,
    localStorage: storage,
  };
  new Function("window", "React", "document", off)(win, {}, undefined);
  return { storage, isMapV2: win.isMapV2 as () => boolean };
}

describe("the Map v2 flag (default ON since D15, 2026-10-13)", () => {
  it("is ON by default, with nothing stored", () => {
    const b = boot();
    expect(b.isMapV2()).toBe(true);
    // a visitor who never chose anything must not get a key written for them
    expect((b.storage as ReturnType<typeof memoryStorage>).dump()).toEqual({});
  });

  it("?map=v1 turns it off and remembers that choice under cc_map_v2", () => {
    const b = boot({ search: "?map=v1" });
    expect(b.isMapV2()).toBe(false);
    expect((b.storage as ReturnType<typeof memoryStorage>).dump()).toEqual({ cc_map_v2: "v1" });
  });

  it("the opt-out survives a reload whose address no longer carries the query (the router rewrites it)", () => {
    const storage = memoryStorage({ cc_map_v2: "v1" });
    expect(boot({ search: "", storage }).isMapV2()).toBe(false);
  });

  it("?map=v2 turns it back on and forgets the opt-out (back to the default)", () => {
    const storage = memoryStorage({ cc_map_v2: "v1" });
    const b = boot({ search: "?map=v2", storage });
    expect(b.isMapV2()).toBe(true);
    expect(storage.dump()).toEqual({});
  });

  it("a device that stored 'v2' while Map v2 was behind the flag stays on, and ?map=v2 tidies the key", () => {
    expect(boot({ storage: memoryStorage({ cc_map_v2: "v2" }) }).isMapV2()).toBe(true);
    const storage = memoryStorage({ cc_map_v2: "v2" });
    expect(boot({ search: "?map=v2", storage }).isMapV2()).toBe(true);
    expect(storage.dump()).toEqual({});
  });

  it("ignores any other value (only the exact 'v1' stored, or ?map=v1, turns it off)", () => {
    expect(boot({ search: "?map=false" }).isMapV2()).toBe(true);
    expect(boot({ search: "?map=0" }).isMapV2()).toBe(true);
    expect(boot({ storage: memoryStorage({ cc_map_v2: "0" }) }).isMapV2()).toBe(true);
    expect(boot({ storage: memoryStorage({ cc_map_v2: "off" }) }).isMapV2()).toBe(true);
  });

  it("with storage blocked: on by default, and ?map=v1 still works for this page and nothing throws", () => {
    expect(boot({ storage: "blocked" }).isMapV2()).toBe(true);
    expect(boot({ search: "?map=v1", storage: "blocked" }).isMapV2()).toBe(false);
    expect(boot({ search: "?map=v2", storage: "blocked" }).isMapV2()).toBe(true);
  });

  it("DEFAULT_ON = false is the one-line rollback: off for everyone, a device's stored choice still wins", () => {
    expect(bootRolledBack().isMapV2()).toBe(false);
    expect(bootRolledBack({ search: "?map=v2" }).isMapV2()).toBe(true);
    expect(bootRolledBack({ search: "?map=v2" }).storage.dump()).toEqual({ cc_map_v2: "v2" });
    expect(bootRolledBack({ storage: memoryStorage({ cc_map_v2: "v2" }) }).isMapV2()).toBe(true);
    // the opt-out key is not needed when off is the default
    const s = memoryStorage({ cc_map_v2: "v1" });
    expect(bootRolledBack({ search: "?map=v1", storage: s }).isMapV2()).toBe(false);
    expect(s.dump()).toEqual({});
  });
});

describe("motion tokens and reduced motion", () => {
  const css = readFileSync(join(process.cwd(), "src/frontend/assets/map-v2.css"), "utf8");
  const token = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1].trim();

  it("the JS constants equal the CSS tokens: 120 / 200 / 320 ms and both easings", () => {
    const { motion } = boot().api;
    expect(motion).toEqual({
      fast: 120,
      base: 200,
      slow: 320,
      enter: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      exit: "cubic-bezier(0.4, 0, 1, 1)",
    });
    expect(token("--dur-fast")).toBe(`${motion.fast}ms`);
    expect(token("--dur-base")).toBe(`${motion.base}ms`);
    expect(token("--dur-slow")).toBe(`${motion.slow}ms`);
    expect(token("--ease-enter")).toBe(motion.enter);
    expect(token("--ease-exit")).toBe(motion.exit);
  });

  it("the stylesheet collapses every duration under prefers-reduced-motion", () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    for (const t of ["--dur-fast", "--dur-base", "--dur-slow", "--shimmer-dur"]) {
      expect(block).toMatch(new RegExp(`${t}:\\s*0ms;`));
    }
  });

  it("dur() returns the token normally and 0 when the person asked for less motion", () => {
    expect(boot().api.dur("base")).toBe(200);
    expect(boot({ reduced: true }).api.dur("base")).toBe(0);
    expect(boot({ reduced: true }).api.prefersReducedMotion()).toBe(true);
  });
});

describe("the map look follows the phone (founder, D1 as revised 2026-10-12)", () => {
  it("is dark when the phone is dark and light when it is light", () => {
    expect(boot({ dark: true }).api.resolvedTheme()).toBe("dark");
    expect(boot({ dark: false }).api.resolvedTheme()).toBe("light");
  });

  it("ignores a choice stored by the retired Map look control", () => {
    expect(boot({ storage: memoryStorage({ cc_map_theme: "dark" }), dark: false }).api.resolvedTheme()).toBe("light");
    expect(boot({ storage: memoryStorage({ cc_map_theme: "light" }), dark: true }).api.resolvedTheme()).toBe("dark");
  });

  it("offers no way to set a look in-app", () => {
    const api = boot().api as Record<string, unknown>;
    expect(api.setTheme).toBeUndefined();
    expect(api.themeSetting).toBeUndefined();
  });
});
