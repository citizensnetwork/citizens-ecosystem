/**
 * Map v2 foundations (`src/frontend/app/map-v2-lib.jsx`, tracker P1-01 / P1-03):
 * the `?map=v2` flag, the motion constants and the map-look setting. The file is
 * an IIFE that publishes `window.isMapV2` / `window.MapV2`, so it is evaluated
 * against a stub window like the other frontend modules (no DOM here, which also
 * means the stylesheet/badge mount is skipped, exactly the "does nothing without
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
  themeSetting: () => string;
  resolvedTheme: () => string;
  setTheme: (t: string) => void;
  FLAG_KEY: string;
  THEME_KEY: string;
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

describe("the ?map=v2 flag", () => {
  it("is OFF by default", () => {
    expect(boot().isMapV2()).toBe(false);
  });

  it("?map=v2 turns it on and remembers it under cc_map_v2", () => {
    const b = boot({ search: "?map=v2" });
    expect(b.isMapV2()).toBe(true);
    expect((b.storage as ReturnType<typeof memoryStorage>).dump()).toEqual({ cc_map_v2: "v2" });
  });

  it("survives a reload whose address no longer carries the query (the router rewrites it)", () => {
    const storage = memoryStorage({ cc_map_v2: "v2" });
    expect(boot({ search: "", storage }).isMapV2()).toBe(true);
  });

  it("?map=v1 clears it again", () => {
    const storage = memoryStorage({ cc_map_v2: "v2" });
    const b = boot({ search: "?map=v1", storage });
    expect(b.isMapV2()).toBe(false);
    expect(storage.dump()).toEqual({});
  });

  it("ignores any other value (only the exact 'v2' stored turns it on)", () => {
    expect(boot({ search: "?map=true" }).isMapV2()).toBe(false);
    expect(boot({ storage: memoryStorage({ cc_map_v2: "1" }) }).isMapV2()).toBe(false);
  });

  it("with storage blocked, ?map=v2 still works for this page and nothing throws", () => {
    expect(boot({ search: "?map=v2", storage: "blocked" }).isMapV2()).toBe(true);
    expect(boot({ storage: "blocked" }).isMapV2()).toBe(false);
  });

  it("does not write anything while off", () => {
    const b = boot();
    expect((b.storage as ReturnType<typeof memoryStorage>).dump()).toEqual({});
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

describe("the map look setting (auto | light | dark)", () => {
  it("defaults to LIGHT, whatever the phone is set to (founder, D1)", () => {
    const b = boot({ dark: true });
    expect(b.api.themeSetting()).toBe("light");
    expect(b.api.resolvedTheme()).toBe("light");
  });

  it("'dark' is dark, 'auto' follows the system, an unknown stored value falls back to light", () => {
    expect(boot({ storage: memoryStorage({ cc_map_theme: "dark" }) }).api.resolvedTheme()).toBe("dark");
    expect(boot({ storage: memoryStorage({ cc_map_theme: "auto" }), dark: true }).api.resolvedTheme()).toBe("dark");
    expect(boot({ storage: memoryStorage({ cc_map_theme: "auto" }), dark: false }).api.resolvedTheme()).toBe("light");
    expect(boot({ storage: memoryStorage({ cc_map_theme: "neon" }) }).api.themeSetting()).toBe("light");
  });

  it("setTheme stores a valid choice and ignores an invalid one", () => {
    const b = boot();
    b.api.setTheme("dark");
    expect(b.api.themeSetting()).toBe("dark");
    b.api.setTheme("sepia");
    expect(b.api.themeSetting()).toBe("dark");
  });
});
