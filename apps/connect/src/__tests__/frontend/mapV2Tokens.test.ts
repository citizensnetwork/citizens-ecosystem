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
