/**
 * Map v2 foundations (`src/frontend/app/map-v2-lib.jsx`, tracker P1-03):
 * the motion constants and the map look (the `?map=` flag is gone, issue #179). The file is
 * an IIFE that publishes `window.MapV2`, so it is evaluated
 * against a stub window like the other frontend modules (boot() has no document, so
 * the stylesheet mount is skipped: the "does nothing without a document" path;
 * bootWithDocument() gives it a minimal one so mount() runs).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFrontend } from "./support/loadFrontend";

type MapV2 = {
  motion: { fast: number; base: number; slow: number; enter: string; exit: string };
  dur: (n: "fast" | "base" | "slow") => number;
  prefersReducedMotion: () => boolean;
  resolvedTheme: () => string;
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
  return { win, storage, api: win.MapV2 as MapV2 };
}

/** boot() with a minimal document, so mount() runs (it forgets the old choices, then adds the stylesheet link). */
function bootWithDocument(opts: { storage?: ReturnType<typeof memoryStorage> | "blocked" } = {}) {
  const storage = opts.storage === "blocked" ? null : (opts.storage ?? memoryStorage());
  const appended: unknown[] = [];
  const doc = {
    readyState: "complete",
    head: { appendChild: (n: unknown) => void appended.push(n) },
    documentElement: { setAttribute: () => undefined },
    createElement: () => ({}),
    addEventListener: () => undefined,
  };
  const win: Record<string, unknown> = {
    location: { search: "" },
    matchMedia: () => ({ matches: false }),
    dispatchEvent: () => true,
  };
  if (opts.storage === "blocked") {
    Object.defineProperty(win, "localStorage", {
      get() {
        throw new Error("SecurityError");
      },
    });
  } else {
    win.localStorage = storage;
  }
  const src = readFileSync(join(process.cwd(), "src/frontend/app/map-v2-lib.jsx"), "utf8");
  new Function("window", "React", "document", src)(win, {}, doc);
  return { storage, appended, win };
}

describe("the old map is gone (issue #179, R6): no flag, and old choices are harmless", () => {
  it("publishes no isMapV2 and no flag API", () => {
    const b = boot();
    expect(b.win.isMapV2).toBeUndefined();
    const api = b.api as unknown as Record<string, unknown>;
    expect(api.isOn).toBeUndefined();
    expect(api.FLAG_KEY).toBeUndefined();
  });

  it("nothing reads the query: ?map=v1 and ?map=v2 change nothing", () => {
    for (const search of ["?map=v1", "?map=v2", "?map=false", "?map=0"]) {
      const b = boot({ search });
      expect(b.api.resolvedTheme(), search).toBe("light");
    }
  });

  it("an old cc_map_v2 choice ('v1' or 'v2') is forgotten when the page mounts, and nothing else is touched", () => {
    for (const old of ["v1", "v2", "off"]) {
      const storage = memoryStorage({ cc_map_v2: old, cc_other: "keep" });
      bootWithDocument({ storage });
      expect(storage.dump(), old).toEqual({ cc_other: "keep" });
    }
  });

  it("with storage blocked: nothing throws", () => {
    expect(() => bootWithDocument({ storage: "blocked" })).not.toThrow();
  });

  it("the source keeps no flag: no isMapV2, no DEFAULT_ON, no ?map= query read", () => {
    const src = readFileSync(join(process.cwd(), "src/frontend/app/map-v2-lib.jsx"), "utf8");
    expect(src).not.toMatch(/window\.isMapV2\s*=/);
    expect(src).not.toContain("DEFAULT_ON");
    expect(src).not.toContain("URLSearchParams");
    expect(src).not.toContain("location.search");
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

describe("the fixed tilt (tracker R8, founder decision D17)", () => {
  const api = () => boot().api as unknown as { PITCH: number };

  it("is one named constant: 45 degrees (the founder's pick on 2026-10-15; 60 about doubled the tile requests)", () => {
    expect(api().PITCH).toBe(45);
  });

  it("is a whole number of degrees MapLibre accepts (0 turns it off; the cap is 60 so no sky shows)", () => {
    const p = api().PITCH;
    expect(Number.isInteger(p)).toBe(true);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(60);
  });

  it("the map reads it only when it is above 0 (the rollback is PITCH = 0)", () => {
    const src = readFileSync(join(process.cwd(), "src/frontend/app/map.jsx"), "utf8");
    expect(src).toContain("window.MapV2.PITCH > 0 ? window.MapV2.PITCH : 0");
    // all four options come from the one angle, and nothing else in the file sets a pitch
    expect(src).toContain("pitch: tilt, minPitch: tilt, maxPitch: tilt, touchPitch: false, pitchWithRotate: false");
    expect(src.match(/\bpitch\s*:/g)?.length).toBe(1);
  });

  it("the address-picker map is built without any pitch option (it stays flat)", () => {
    const src = readFileSync(join(process.cwd(), "src/frontend/app/map.jsx"), "utf8");
    const picker = src.slice(src.indexOf("function LocationPicker"));
    expect(picker).not.toMatch(/pitch|PITCH|tilt/i);
  });
});

describe("count buckets (tracker P2-08): shown only from 100, rounded down, never below", () => {
  const bucket = () => boot().api as unknown as { countBucket: (n: unknown) => string };

  it("shows nothing below 100, however small the number or odd the input", () => {
    const { countBucket } = bucket();
    for (const n of [0, 1, 7, 42, 99, 99.9, -5, "12", null, undefined, NaN, Infinity, "", "abc", {}]) expect(countBucket(n), String(n)).toBe("");
  });

  it("rounds down to the step: 100+, 250+, 500+, 1,000+, 2,500+, 5,000+, 10,000+ and up", () => {
    const { countBucket } = bucket();
    const cases: [number, string][] = [
      [100, "100+"], [101, "100+"], [249, "100+"], [250, "250+"], [499, "250+"], [500, "500+"], [999, "500+"],
      [1000, "1,000+"], [2499, "1,000+"], [2500, "2,500+"], [4999, "2,500+"], [5000, "5,000+"], [9999, "5,000+"],
      [10000, "10,000+"], [24999, "10,000+"], [25000, "25,000+"], [50000, "50,000+"], [100000, "100,000+"], [5_000_000, "100,000+"],
    ];
    for (const [n, want] of cases) expect(countBucket(n), String(n)).toBe(want);
  });

  it("never prints a number higher than the real one (it only rounds down)", () => {
    const { countBucket } = bucket();
    for (let n = 100; n <= 120_000; n += 37) {
      const shown = Number(countBucket(n).replace(/[^\d]/g, ""));
      expect(shown, String(n)).toBeLessThanOrEqual(n);
      expect(shown, String(n)).toBeGreaterThanOrEqual(100);
    }
  });

  it("accepts a numeric string from the API", () => {
    expect(bucket().countBucket("1234")).toBe("1,000+");
  });
});
