// @vitest-environment node
/**
 * Tailwind is compiled at build time (QA fix plan PR F1, item S3, 2026-11-25), not by the Play CDN in every visitor's
 * browser, and the fonts are served from our own origin. This test holds the parts a later edit could quietly break:
 *
 *  - the page loads no Play CDN, no inline `tailwind.config` and no Google Fonts (they cost a phone on 4G about 0.5 s
 *    and two extra origins, and F3's strict CSP has no room for them);
 *  - the compiled stylesheet's placeholder sits LAST in <head>, where the Play CDN injected its rules: the screens
 *    were styled against that order (a utility after report.css wins a tie, and preflight after the inline <style>);
 *  - the compiled sheet has the theme (gold, the two font families), the self-hosted faces and the boot screen,
 *    and Tailwind is the Play CDN's exact version;
 *  - the boot screen in #root mirrors the React LoadingSplash (same crown size), so the hand-over does not jump;
 *  - MapLibre loads through maplibre-loader.js, not with the page.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const APP = process.cwd();
const require = createRequire(join(APP, "package.json"));
const index = readFileSync(join(APP, "src/frontend/index.html"), "utf8");
const head = index.slice(0, index.indexOf("</head>"));
/** Every host an absolute http(s) URL in the page names (tags and comments alike: a commented-out link still counts). */
const hostsIn = (html: string) => [...html.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => new URL(m[0]).hostname);

describe("index.html: no Play CDN, no Google Fonts, the compiled sheet last in <head>", () => {
  it("loads neither the Tailwind Play CDN nor an inline tailwind.config", () => {
    expect(hostsIn(index)).not.toContain("cdn.tailwindcss.com");
    expect(index).not.toMatch(/tailwind\.config\s*=/);
  });

  it("links no Google Fonts", () => {
    expect(hostsIn(index)).not.toContain("fonts.googleapis.com");
    expect(hostsIn(index)).not.toContain("fonts.gstatic.com");
  });

  it("links the compiled stylesheet once, as the last stylesheet of <head>", () => {
    expect(index.match(/<link href="assets\/tailwind\.css" rel="stylesheet" \/>/g)).toHaveLength(1);
    const sheets = [...head.matchAll(/<link [^>]*rel="stylesheet"[^>]*>|<style>/g)].map((m) => m[0]);
    expect(sheets.at(-1)).toBe('<link href="assets/tailwind.css" rel="stylesheet" />');
  });

  it("loads MapLibre on demand through maplibre-loader.js, with no inline module", () => {
    expect(index).toContain('<script type="module" src="maplibre-loader.js"></script>');
    expect(index).not.toMatch(/<script type="module">/);
    const loader = readFileSync(join(APP, "src/frontend/maplibre-loader.js"), "utf8");
    expect(loader).toContain("import('./vendor/maplibre-gl/maplibre-gl.mjs')");
    expect(readFileSync(join(APP, "src/frontend/app/map.jsx"), "utf8")).toMatch(/window\.ccLoadMaplibre\(\)/);
  });

  it("paints a boot screen in #root that mirrors the React LoadingSplash's crown", () => {
    const boot =
      /<div id="root"><div class="cc-boot" role="status" aria-label="([^"]+)"><img src="assets\/citizens-crown\.png\?v=(\w+)" alt="" width="72" height="39" \/>/.exec(
        index,
      );
    expect(boot).not.toBeNull();
    // a different name from the React splash ("Loading Citizens Connect"), which e2e/loading-splash.spec.ts watches for
    expect(boot?.[1]).toBe("Opening Citizens Connect");
    const auth = readFileSync(join(APP, "src/frontend/app/auth.jsx"), "utf8");
    // the same crown file (and cache key) and the same size as LoadingSplash's h(CrownMark, { size: 72 })
    expect(auth).toContain(`/assets/citizens-crown.png?v=${boot?.[2]}`);
    expect(auth).toMatch(/function LoadingSplash\(\)[\s\S]{0,600}h\(CrownMark, \{ size: 72 \}\)/);
  });
});

describe("the compiled stylesheet", () => {
  let css = "";
  let fontFiles: { from: string; to: string }[] = [];

  beforeAll(async () => {
    const { compileFrontendStyles } = require("./scripts/frontend-styles.js");
    ({ css, fontFiles } = await compileFrontendStyles({
      rootDir: APP,
      esbuild: require("esbuild"),
    }));
  }, 60_000);

  it("is compiled by Tailwind 3.4.17, the Play CDN's version", () => {
    expect(require("tailwindcss/package.json").version).toBe("3.4.17");
  });

  it("carries the theme the inline config had", () => {
    expect(css).toMatch(/\.bg-gold\{[^}]*background-color:rgb\(242 189 34/);
    expect(css).toMatch(/\.text-gold-dark\{[^}]*color:rgb\(131 97 0/);
    expect(css).toMatch(/\.font-brand\{font-family:Manrope,/);
    expect(css).toMatch(/html,:host\{[^}]*font-family:Plus Jakarta Sans,/); // preflight puts the theme sans on the page
  });

  it("has utilities the screens use, and preflight", () => {
    for (const cls of [".absolute", ".rounded-full", ".text-muted-foreground", ".hover\\:shadow-xl:hover"]) {
      expect(css).toContain(cls);
    }
    expect(css).toMatch(/--tw-border-spacing-x/); // preflight's reset, as the Play CDN injected it
  });

  it("serves the three families from our own origin, Latin and Latin Extended", () => {
    const faces = css.match(/@font-face\{[^}]*\}/g) ?? [];
    expect(faces).toHaveLength(4); // Jakarta and Manrope: 2 subsets each (Playfair dropped, founder 2026-11-26)
    expect(css).not.toContain("Playfair");
    for (const family of ["Plus Jakarta Sans", "Manrope"]) {
      expect(faces.some((f) => f.includes(`font-family:${family};`))).toBe(true);
    }
    for (const face of faces) expect(face).toMatch(/url\(\.\.\/vendor\/fonts\/[a-z0-9-]+\.[0-9a-f]{10}\.woff2\)/);
    expect(fontFiles).toHaveLength(4);
    for (const f of fontFiles) {
      expect(existsSync(f.from)).toBe(true);
      expect(css).toContain(f.to);
    }
  });

  it("joins base, report and listing-claim in front of Tailwind, in the order their links had (PR F3)", () => {
    const at = (needle: string) => css.indexOf(needle);
    const base = at("--gold-crown:");
    const report = at("cc-report-scrim-in");
    const claim = at("cc-claim-scrim-in");
    const preflight = at("--tw-border-spacing-x");
    for (const [name, pos] of Object.entries({ base, report, claim, preflight })) expect(pos, name).toBeGreaterThan(-1);
    expect([base, report, claim, preflight]).toEqual([...[base, report, claim, preflight]].sort((a, b) => a - b));
    expect(index).not.toMatch(/href="assets\/(?:base|report|listing-claim)\.css/);
  });

  it("styles the boot screen", () => {
    expect(css).toMatch(/\.cc-boot\{/);
    expect(css).toMatch(/\.cc-boot-ring\{/);
    expect(css).toMatch(/@keyframes cc-boot-spin/);
  });
});
