/**
 * Issue 217: the contributor sheet's tab bar and panel are one block, closed by
 * the existing divider. The hairline is not a control, so WCAG 1.4.11 (3:1) does
 * not apply; this test still measures it against the sheet surface in both looks
 * so a token edit cannot land unnoticed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const css = read("src/frontend/assets/map-v2.css");
const sheet = read("src/frontend/app/map-v2-sheet.jsx");
const lib = read("src/frontend/app/map-v2-lib.jsx");
const html = read("src/frontend/index.html");

function sliceBetween(src: string, start: string, end: string) {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i + start.length);
  expect(i).toBeGreaterThanOrEqual(0);
  expect(j).toBeGreaterThan(i);
  return src.slice(i, j);
}

function decl(block: string, name: string) {
  const m = block.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`missing ${name}`);
  return m[1].trim();
}

function hex(raw: string) {
  const m = /^#([0-9a-f]{6})$/i.exec(raw);
  if (!m) throw new Error(raw);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(raw: string) {
  const m = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0?\.\d+|1|0)\s*\)$/.exec(raw);
  if (!m) throw new Error(raw);
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: Number(m[4]) };
}

/** WCAG relative luminance, then contrast of the divider blended over the surface. */
function contrast(surface: number[], ink: number[], alpha: number) {
  const blend = ink.map((c, i) => c * alpha + surface[i] * (1 - alpha));
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = (rgb: number[]) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const a = L(blend);
  const b = L(surface);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

describe("map sheet tabbed block (issue 217)", () => {
  it("closes the block with the existing divider and sticks the tab bar inside it", () => {
    const tabbed = sliceBetween(css, "[data-mv2='tabbed'] {", "[data-mv2='tabbed'] [data-mv2='tabs']");
    expect(decl(tabbed, "margin")).toBe("0 0 var(--space-1)");
    expect(decl(tabbed, "padding-bottom")).toBe("var(--space-5)");
    expect(decl(tabbed, "border-bottom")).toBe("1px solid var(--divider)");

    const stuck = sliceBetween(css, "[data-mv2='tabbed'] [data-mv2='tabs'] {", "[data-mv2='panel'] {");
    expect(decl(stuck, "position")).toBe("sticky");
    expect(decl(stuck, "top")).toBe("0");
    expect(decl(stuck, "z-index")).toBe("var(--z-sticky)");
    expect(decl(sliceBetween(css, "/* z-index:", "/* motion:"), "--z-sticky")).toBe("1");
    expect(decl(stuck, "background")).toBe("var(--surface-1)");

    const panel = sliceBetween(css, "[data-mv2='panel'] {", "[data-mv2='panel']:focus-visible");
    expect(decl(panel, "min-height")).toBe("var(--space-8)");
    const focus = sliceBetween(css, "[data-mv2='panel']:focus-visible {", "[data-mv2='list']");
    expect(decl(focus, "outline")).toBe("var(--focus-w) solid var(--focus-ring)");
    expect(decl(focus, "outline-offset")).toBe("var(--focus-offset)");

    // The bar keeps its own line and its own margin. Nearby keeps its own padding.
    expect(css).toMatch(/\[data-mv2='tabs'\]\s*\{[^}]*margin:\s*var\(--space-2\)\s+0\s+var\(--space-3\);/);
    expect(css).toMatch(/\[data-mv2='tabs'\]\s*\{[^}]*border-bottom:\s*1px solid var\(--divider\);/);
    expect(css).toMatch(/\[data-mv2='nearby'\]\s*\{[^}]*padding:\s*var\(--space-5\)\s+0\s+0;/);
  });

  it("measures the divider on the sheet surface in both looks", () => {
    const light = sliceBetween(css, ":root {", "[data-theme='dark']");
    const dark = sliceBetween(css, "[data-theme='dark'] {", "/* ── 3.");
    expect(decl(light, "--divider")).toBe("rgba(10, 9, 8, 0.12)");
    expect(decl(dark, "--divider")).toBe("rgba(247, 244, 238, 0.14)");
    const lightInk = rgba(decl(light, "--divider"));
    const darkInk = rgba(decl(dark, "--divider"));
    const lightRatio = contrast(hex(decl(light, "--surface-1")), lightInk.rgb, lightInk.a);
    const darkRatio = contrast(hex(decl(dark, "--surface-1")), darkInk.rgb, darkInk.a);
    // About 1.30:1 light and 1.48:1 dark. Below 3:1 on purpose: a non-interactive hairline.
    expect(lightRatio).toBeCloseTo(1.302, 2);
    expect(darkRatio).toBeCloseTo(1.485, 2);
    expect(lightRatio).toBeGreaterThan(1);
    expect(darkRatio).toBeGreaterThan(1);
  });

  it("wraps the bar, the panel and the loading skeleton, and busts the cached sheet and stylesheet", () => {
    expect(sheet).toContain("'data-mv2': 'tabbed'");
    expect(sheet).toContain("tabIndex: 0");
    expect(sheet).toContain("scrollTop += d");
    expect(sheet).not.toContain("role: 'separator'");
    expect(lib).toContain("/assets/map-v2.css?v=20261025a");
    expect(html).toContain("app/map-v2-sheet.jsx?v=20261025a");
    expect(html).toContain("app/map-v2-lib.jsx?v=20261026a");
  });
});
