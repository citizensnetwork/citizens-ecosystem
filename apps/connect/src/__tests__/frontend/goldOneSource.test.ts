/**
 * One gold (founder decision, 2026-10-31): the crown logo's own colour, #F2BD22, is Connect's only fill gold, and every
 * place that writes a gold value (the Tailwind config and `:root` in index.html, Map v2's tokens, the map pins, the PWA
 * manifest) agrees on it. Gold text and small icons use the dark ink #836100; a gradient is light, the crown, then amber
 * (never a brown end stop); a label on a gold fill is near-black, never white. The contrast pairs themselves are in
 * `scripts/map-v2/contrast.mjs` (asserted by mapV2Tokens.test.ts); this file keeps the sources from drifting apart again.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { analyseRepo, isFillGold } from "../../../scripts/design/drift.mjs";

const APP = process.cwd();
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const index = read("src/frontend/index.html");
const mapCss = read("src/frontend/assets/map-v2.css");

const CROWN = "#f2bd22";
const INK = "#836100";
const LIGHT = "#fcdd6c";
const AMBER = "#e3a00a";

/** The first colour a declaration `name: #hex` (or a quoted Tailwind key) gives, lower case. */
const decl = (text: string, name: string) => new RegExp(`${name}['"]?\\s*:\\s*['"]?(#[0-9a-fA-F]{6})`).exec(text)?.[1].toLowerCase();

/** Every application source file that could carry a colour (never vendored code, tests or docs). */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(APP, dir))) {
    const rel = join(dir, name);
    if (name === "node_modules" || name === "vendor" || name === "__tests__") continue;
    if (statSync(join(APP, rel)).isDirectory()) sources(rel, out);
    else if (/\.(jsx?|tsx?|mjs|css|html|json|svg)$/.test(name)) out.push(rel);
  }
  return out;
}

describe("one gold: the crown's colour", () => {
  it("the crown gold is the one fill gold; its stops and its ink are not fill golds", () => {
    expect(isFillGold(CROWN)).toBe(true);
    for (const c of [LIGHT, AMBER, INK, "#fbf1cc"]) expect(isFillGold(c), c).toBe(false);
  });

  it("Connect's source set has exactly one fill gold (the drift index counts every extra one)", () => {
    expect(analyseRepo().apps.connect.golds).toEqual([CROWN]);
  });

  it("every token source agrees on the crown gold and on the ink", () => {
    // the Tailwind config and :root in index.html
    expect(decl(index, "gold")).toBe(CROWN);
    expect(decl(index, "secondary")).toBe(CROWN);
    expect(decl(index, "--gold")).toBe(CROWN);
    expect(decl(index, "gold-light")).toBe(LIGHT);
    expect(decl(index, "--gold-light")).toBe(LIGHT);
    expect(decl(index, "--gold-deep")).toBe(AMBER);
    expect(decl(index, "gold-dark")).toBe(INK);
    expect(decl(index, "--gold-dark")).toBe(INK);
    // Map v2: light and dark
    const dark = /\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/.exec(mapCss)![1];
    expect(decl(mapCss, "--accent")).toBe(CROWN);
    expect(decl(mapCss, "--accent-ink")).toBe(INK);
    expect(decl(mapCss, "--focus-ring")).toBe(INK);
    expect(decl(dark, "--accent")).toBe(CROWN);
    expect(decl(dark, "--accent-ink")).toBe(CROWN); // in the dark look the ink is the crown gold itself
    expect(decl(dark, "--focus-ring")).toBe(CROWN);
    // the pins and the installed app
    expect(read("src/lib/map/markers.ts")).toContain(`"${CROWN.toUpperCase()}"`);
    expect(JSON.parse(read("public/manifest.json")).theme_color.toLowerCase()).toBe(CROWN);
  });

  it("no retired gold is left in application code", () => {
    const retired = /#(c9a84c|d4af37|e8d48b|8b6914|e9ce72|9c7a1d|c8a24f|f2e8cc)\b|rgba?\(\s*(201\s*,\s*168\s*,\s*76|212\s*,\s*175\s*,\s*55)\b/i;
    const hits = ["src/frontend", "src/lib", "src/app", "public"].flatMap((d) => sources(d)).filter((f) => retired.test(read(f)));
    expect(hits).toEqual([]);
  });
});

describe("gold fills and gold text", () => {
  const rule = (selector: string) => new RegExp(`${selector.replace(/[.[\]*]/g, "\\$&")}[^{]*\\{([^}]*)\\}`).exec(index)?.[1] ?? "";

  it("the gradient is light, the crown, then amber: no brown end stop", () => {
    expect(rule(".gold-gradient")).toMatch(/linear-gradient\(135deg,\s*var\(--gold-light\) 0%,\s*var\(--gold\) 55%,\s*var\(--gold-deep\) 100%\)/);
    for (const g of index.match(/linear-gradient\([^)]*\)/g) ?? []) expect(g, g).not.toMatch(/--gold-dark|--gold-crown-dark/);
  });

  it("a label on a gold fill is near-black: every `text-white` on one is overridden at the source", () => {
    expect(index).toMatch(/\.gold-gradient\.text-white[^{]*\{\s*color:\s*var\(--accent-contrast,\s*#0A0908\)/);
    expect(index).toMatch(/\.bg-gold\.text-white/);
    expect(index).toMatch(/\.gold-gradient \[class\*="text-white"\]/);
  });

  it("gold text is the ink, never a clipped vivid gradient, and `text-gold` reads as the ink", () => {
    expect(rule(".gold-text")).toMatch(/color:\s*var\(--gold-dark\)/);
    expect(index).not.toMatch(/-webkit-text-fill-color:\s*transparent/);
    expect(index).toMatch(/:root \.text-gold\s*\{\s*color:\s*var\(--gold-dark\)/);
  });
});
