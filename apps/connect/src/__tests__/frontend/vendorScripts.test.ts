// @vitest-environment node
/**
 * The frontend's libraries come from our own origin (QA fix plan PR F2, 2026-11-25), not from unpkg or jsDelivr:
 * React and ReactDOM 18.3.1, supabase-js and a trimmed lucide, written by scripts/frontend-vendor.js as hashed files
 * where index.html's placeholders stand. This holds the parts a later edit could quietly break:
 *
 *  - the page names no absolute URL at all (no CDN script, style or font can creep back in);
 *  - React and ReactDOM are exactly the 18.3.1 production builds the page loaded from unpkg (the SRI hashes the old
 *    tags carried), and supabase-js is the lockfile's own UMD build;
 *  - lucide is trimmed, keeps every icon the screens name literally, and has the shape app/icons.jsx reads;
 *  - the CSP lets scripts and styles come from this origin only (no CDN host).
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = process.cwd();
const require = createRequire(join(APP, "package.json"));
const { vendorScripts } = require("./scripts/frontend-vendor.js") as {
  vendorScripts: (root: string) => {
    scripts: { src: string; code: string }[];
    iconNames: string[];
  };
};
const vendor = vendorScripts(APP);
const code = (src: string) => vendor.scripts.find((s) => s.src === src)?.code ?? "";
const sri = (text: string) => `sha384-${createHash("sha384").update(text).digest("base64")}`;
const index = readFileSync(join(APP, "src/frontend/index.html"), "utf8");

describe("the libraries come from our own origin", () => {
  it("index.html names no absolute URL", () => {
    expect([...index.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0])).toEqual([]);
  });

  it("loads each vendored library through its placeholder, once, in the order React needs", () => {
    const order = ["vendor/lucide.js", "vendor/react.js", "vendor/react-dom.js", "vendor/supabase.js", "config.js"];
    const at = order.map((src) => index.indexOf(`<script src="${src}"></script>`));
    for (const [i, pos] of at.entries()) expect(pos, order[i]).toBeGreaterThan(index.indexOf('<div id="root">'));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(vendor.scripts.map((s) => s.src).sort()).toEqual(order.slice(0, 4).sort());
  });

  it("React and ReactDOM are the 18.3.1 production builds the page used to load from unpkg", () => {
    expect(sri(code("vendor/react.js"))).toBe(
      "sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z",
    );
    expect(sri(code("vendor/react-dom.js"))).toBe(
      "sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1",
    );
  });

  it("supabase-js is the installed package's UMD build", () => {
    const pkg = JSON.parse(readFileSync(join(APP, "node_modules/@supabase/supabase-js/package.json"), "utf8"));
    expect(code("vendor/supabase.js")).toBe(
      readFileSync(join(APP, "node_modules/@supabase/supabase-js/dist/umd/supabase.js"), "utf8"),
    );
    expect(pkg.version).toMatch(/^2\./);
  });

  it("lucide is trimmed, and keeps the icons the screens name", () => {
    const win: { lucide?: { icons: Record<string, unknown> } } = {};
    new Function("window", code("vendor/lucide.js"))(win);
    const icons = win.lucide!.icons;
    expect(Object.keys(icons).sort()).toEqual(vendor.iconNames);
    expect(vendor.iconNames.length).toBeLessThan(400); // the full set is about 2,000
    for (const name of ["MapPin", "Search", "X", "Coffee", "Church", "ChevronRight", "Calendar"])
      expect(icons[name], name).toBeTruthy();
    // the flat child list app/icons.jsx reads: [[tag, attrs], ...]
    const node = icons.MapPin as [string, Record<string, string>][];
    expect(typeof node[0][0]).toBe("string");
  });

  it("the CSP lets scripts and styles come from this origin only", () => {
    const config = readFileSync(join(APP, "next.config.ts"), "utf8");
    const scriptSrc = /`script-src ([^`]*)`/.exec(config)?.[1] ?? "";
    const styleSrc = /"style-src ([^"]*)"/.exec(config)?.[1] ?? "";
    for (const src of [scriptSrc, styleSrc]) {
      expect(src).toContain("'self'");
      expect(src).not.toMatch(/https:/);
    }
  });
});
