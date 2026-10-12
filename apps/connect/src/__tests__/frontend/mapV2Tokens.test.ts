/**
 * Map v2 token contrast (tracker P1-02, M5). The maths and the pair list live in
 * `scripts/map-v2/contrast.mjs` (it also writes docs/audit/contrast.md); this test
 * runs it, so a token edit that drops a pair under its threshold (text 4.5:1,
 * icons / rings / pin borders 3:1) fails here instead of in review. It also
 * enforces the "no raw hex or px outside the tokens" rule for component CSS.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src/frontend/assets/map-v2.css"), "utf8");

/** Everything after the token blocks, comments removed. */
const components = (() => {
  const i = css.indexOf("/* ── 4. Components");
  return css.slice(i).replace(/\/\*[\s\S]*?\*\//g, "");
})();
const valuesOf = (prop: string) => [...components.matchAll(new RegExp(`(?<![\\w-])${prop}:\\s*([^;]+);`, "g"))].map((m) => m[1].trim());

describe("Map v2 visual consistency (tracker section 12.3)", () => {
  it("three type sizes and two weights only: every font-size and font-weight is a token", () => {
    for (const v of valuesOf("font-size")) expect(v).toMatch(/^(var\(--fs-[123]\)|inherit)$/);
    for (const v of valuesOf("font-weight")) expect(v).toMatch(/^var\(--fw-(regular|semibold)\)$/);
    expect(css).toMatch(/--fw-regular:\s*400;/);
    expect(css).toMatch(/--fw-semibold:\s*600;/);
  });

  it("radii come from {8, 12, 20, 999}: every border-radius is a radius token", () => {
    const radii = [...css.matchAll(/--radius-(sm|md|lg|full):\s*(\d+)px;/g)].map((m) => Number(m[2])).sort((a, b) => a - b);
    expect(radii).toEqual([8, 12, 20, 999]);
    for (const v of valuesOf("border-radius")) {
      for (const part of v.split(/\s+/)) expect(part).toMatch(/^(var\(--(radius-(sm|md|lg|full)|sheet-radius)\)|0)$/);
    }
  });

  it("spacing comes from the 4-pt scale: 4, 8, 12, 16, 20, 24, 32, 48", () => {
    const sp = [...css.matchAll(/--space-\d:\s*(\d+)px;/g)].map((m) => Number(m[1]));
    expect(sp).toEqual([4, 8, 12, 16, 20, 24, 32, 48]);
    // padding, margin and gap in components read tokens (or 0)
    const strip = (v: string) => v.replace(/var\(--[a-z0-9-]+\)|calc\([^;]*\)|env\([^)]*\)|\b0\b|auto/g, "").trim();
    for (const prop of ["padding", "margin", "gap", "padding-top", "padding-bottom", "margin-top", "margin-bottom"]) {
      for (const v of valuesOf(prop)) expect(strip(v), `${prop}: ${v}`).toBe("");
    }
  });

  it("one accent: gold is only ever read through the accent tokens, and no new gold exists", () => {
    expect(components).not.toMatch(/#c9a84c|#d4af37|#8b6914|#e8d48b/i);
    const gold = (css.match(/#c9a84c|#d4af37|#8b6914|#e8d48b/gi) || []).map((x) => x.toLowerCase());
    // plain gold, dark gold, light gold: the brand values already in index.html, nothing new
    expect(new Set(gold)).toEqual(new Set(["#c9a84c", "#8b6914", "#e8d48b"]));
  });
});

describe("Map v2 tokens", () => {
  it("every contrast pair meets its threshold in the light and the dark set", () => {
    // Exits non-zero (so execFileSync throws) when any pair is below its threshold.
    const out = execFileSync(process.execPath, [join(process.cwd(), "scripts/map-v2/contrast.mjs")], { encoding: "utf8" });
    expect(out).toContain("| Pair | Needs | Light | Dark |");
    expect(out).not.toContain("**FAIL**");
  });

  it("defines a dark set under [data-theme='dark'] and a light set on :root", () => {
    expect(css).toMatch(/:root\s*\{/);
    expect(css).toMatch(/\[data-theme='dark'\]\s*\{/);
    for (const role of ["--surface-0", "--surface-1", "--surface-2", "--text-1", "--text-2", "--accent", "--accent-contrast", "--ok", "--closed", "--error", "--pin-border", "--scrim"]) {
      expect(css.match(new RegExp(`${role}:`, "g"))?.length, role).toBeGreaterThanOrEqual(2);
    }
  });

  it("component rules (everything after the token blocks) use no raw hex or px values", () => {
    // Components start after the reduced-motion block's closing brace (section 4).
    const marker = "/* ── 4. Components";
    const idx = css.indexOf(marker);
    expect(idx).toBeGreaterThan(0);
    const components = css.slice(idx).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(components).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // 0 and 1px are allowed; anything else in px must come from a token.
    const px = [...components.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)px\b/g)].map((m) => m[1]).filter((n) => n !== "0" && n !== "1");
    expect(px).toEqual([]);
  });
});
