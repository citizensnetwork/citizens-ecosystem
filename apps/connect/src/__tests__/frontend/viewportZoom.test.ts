/**
 * Pinch zoom on the website (tracker R9, founder yes 2026-10-15).
 *
 * `src/frontend/index.html` is served as the website AND bundled into the Capacitor phone app. The
 * viewport tag no longer carries `maximum-scale=1` (a low-vision citizen can zoom the page, WCAG 1.4.4),
 * and a tiny inline script puts the old block back inside the native shell only, until the app has been
 * tested on a phone. This file pins both halves; e2e/pinch-zoom.spec.ts proves them in a real browser
 * with real touch.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const html = readFileSync(join(process.cwd(), "src/frontend/index.html"), "utf8");

const META = /<meta name="viewport" content="([^"]*)" \/>/;
const WEB_CONTENT = "width=device-width, initial-scale=1, viewport-fit=cover";
const NATIVE_CONTENT = "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";

/** The inline script that follows the viewport tag (the first script in the file with no src). */
function nativeScript(): string {
  const m = /<script>\s*([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("no inline script in index.html");
  return m[1];
}

/** Run the inline script against a stub page and return the viewport tag's content afterwards. */
function run(opts: { capacitor?: unknown; protocol?: string; noMeta?: boolean }): string {
  let content = WEB_CONTENT;
  const meta = { setAttribute: (k: string, v: string) => { if (k === "content") content = v; } };
  const doc = { querySelector: (q: string) => (opts.noMeta || q !== 'meta[name="viewport"]' ? null : meta) };
  const win = { Capacitor: opts.capacitor };
  const loc = { protocol: opts.protocol ?? "https:" };
  new Function("window", "document", "location", nativeScript())(win, doc, loc);
  return content;
}

describe("the viewport tag (R9: the website can be pinch zoomed)", () => {
  it("is the first thing in the file after charset, and carries no zoom block", () => {
    const m = META.exec(html);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(WEB_CONTENT);
    expect(m![1]).not.toContain("maximum-scale");
    expect(m![1]).not.toContain("user-scalable");
    // exactly one viewport tag, and it comes before any script runs
    expect(html.match(/<meta name="viewport"/g)).toHaveLength(1);
    expect(html.indexOf("<meta name=\"viewport\"")).toBeLessThan(html.indexOf("<script"));
  });

  it("the inline script runs before every other script (so the native block is in place before the page paints)", () => {
    const inline = html.indexOf("<script>");
    expect(inline).toBeGreaterThan(-1);
    expect(inline).toBeLessThan(html.indexOf("<script src="));
  });
});

describe("the native shell keeps the old block until it is tested on a phone", () => {
  it("a plain browser (no Capacitor object) is left zoomable", () => {
    expect(run({})).toBe(WEB_CONTENT);
  });

  it("Capacitor core running on the web (isNativePlatform() is false) is left zoomable", () => {
    expect(run({ capacitor: { isNativePlatform: () => false } })).toBe(WEB_CONTENT);
  });

  it("the native shell (isNativePlatform() is true) gets maximum-scale=1 back", () => {
    expect(run({ capacitor: { isNativePlatform: () => true } })).toBe(NATIVE_CONTENT);
  });

  it("the iOS shell's own scheme gets it back even before the bridge object exists", () => {
    expect(run({ protocol: "capacitor:" })).toBe(NATIVE_CONTENT);
  });

  it("a Capacitor object that has no isNativePlatform, or throws, never breaks the page and stays zoomable", () => {
    expect(run({ capacitor: {} })).toBe(WEB_CONTENT);
    expect(run({ capacitor: { isNativePlatform: () => { throw new Error("bridge not ready"); } } })).toBe(WEB_CONTENT);
  });

  it("a page without the tag does not throw", () => {
    expect(() => run({ noMeta: true, capacitor: { isNativePlatform: () => true } })).not.toThrow();
  });
});
