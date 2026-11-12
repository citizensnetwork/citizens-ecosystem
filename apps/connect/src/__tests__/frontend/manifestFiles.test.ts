/**
 * The home-screen app's files exist (2026-11-12). Until then `manifest.json` and `sw.js` named
 * `icons/icon-192.png` and `icons/icon-512.png`, which were never committed, and the page did not
 * link the manifest at all, so a phone that saved Connect to its home screen got no icon. Nothing
 * failed: the service worker swallowed a missing file. This test is the alarm that was missing.
 *
 *  - every file the manifest and the page's manifest and touch-icon links name is in `public/`;
 *  - each icon is a PNG of exactly its declared size, opaque (a maskable icon is cropped to any
 *    shape, so a transparent corner would show as black or white);
 *  - the manifest's paths are relative: Connect runs under /citizens/connect/ on 219.co.za, and
 *    a path that starts with "/" would point at the 219 root instead;
 *  - `public/sw.js` is the retired service worker: it only removes the worker phones picked up
 *    between April and June 2026, and nothing in the app registers one.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const APP = process.cwd();
const PUBLIC = join(APP, "public");
const FRONTEND = join(APP, "src", "frontend");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}
const manifest = JSON.parse(read("public/manifest.json")) as { start_url: string; icons: ManifestIcon[] };
const index = read("src/frontend/index.html");

/** A path resolved against the page's <base> or the manifest's own folder: no scheme, no leading slash. */
const isRelative = (path: string) => !/^[a-z][a-z0-9+.-]*:/i.test(path) && !path.startsWith("/");

/** The href of the first <link> whose rel is exactly `rel`. */
function linkHref(rel: string): string | undefined {
  for (const tag of index.match(/<link\b[^>]*>/gi) ?? []) {
    if (new RegExp(`\\brel=["']${rel}["']`, "i").test(tag)) return /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
  }
  return undefined;
}

/** Width, height and colour type from a PNG's IHDR, plus whether a tRNS chunk adds transparency. */
function pngInfo(file: string) {
  const buf = readFileSync(file);
  const signature = buf.subarray(0, 8).toString("hex");
  let transparencyChunk = false;
  for (let at = 8; at + 8 <= buf.length; ) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString("latin1", at + 4, at + 8);
    if (type === "tRNS") transparencyChunk = true;
    if (type === "IEND") break;
    at += 12 + length;
  }
  return {
    signature,
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colourType: buf[25],
    transparencyChunk,
  };
}

describe("the home-screen app's files", () => {
  it("the manifest lists at least a 192 and a 512 icon", () => {
    expect(manifest.icons.map((icon) => icon.sizes).sort()).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  });

  it.each(manifest.icons.map((icon) => [icon.src, icon] as const))("%s exists and is a PNG of its declared size, opaque", (src, icon) => {
    expect(isRelative(src), `${src} must be relative to the manifest`).toBe(true);
    const file = join(PUBLIC, src);
    expect(existsSync(file), `${src} is missing from public/`).toBe(true);
    expect(icon.type).toBe("image/png");
    const png = pngInfo(file);
    expect(png.signature).toBe("89504e470d0a1a0a");
    expect(`${png.width}x${png.height}`).toBe(icon.sizes);
    // 2 is RGB and 0 greyscale: no alpha channel. 4 and 6 carry alpha, 3 (palette) may via tRNS.
    expect([0, 2]).toContain(png.colourType);
    expect(png.transparencyChunk).toBe(false);
  });

  it("the manifest's start address is relative, so it opens Connect under its prefix", () => {
    expect(isRelative(manifest.start_url), manifest.start_url).toBe(true);
  });

  it("the page links the manifest and the iPhone icon, by relative paths to files that exist", () => {
    for (const rel of ["manifest", "apple-touch-icon"]) {
      const href = linkHref(rel);
      expect(href, `<link rel="${rel}">`).toBeTruthy();
      expect(isRelative(href!), href).toBe(true);
      expect(existsSync(join(PUBLIC, href!)), `${href} is missing from public/`).toBe(true);
    }
  });

});

describe("the retired service worker", () => {
  // Comments describe what the file must not do, so only the code is checked.
  const code = read("public/sw.js")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("removes the old store and unregisters itself", () => {
    expect(code).toMatch(/addEventListener\(\s*["']activate["']/);
    expect(code).toContain("caches.delete(");
    expect(code).toContain("self.registration.unregister()");
    // Without this a phone keeps the old worker until every Connect tab is closed.
    expect(code).toContain("self.skipWaiting()");
  });

  it("never answers a request and stores nothing", () => {
    expect(code).not.toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(code).not.toMatch(/respondWith|caches\.open|\.put\(|\.add(All)?\(|clients\.claim/);
  });

  it("nothing in the app registers a service worker", () => {
    const sources = readdirSync(FRONTEND, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.(jsx?|html)$/.test(file) && !/(^|[\\/])vendor[\\/]/.test(file))
      .map((file) => [file, readFileSync(join(FRONTEND, file), "utf8")] as const);
    expect(sources.length).toBeGreaterThan(20);
    const registering = sources.filter(([, text]) => /serviceWorker\s*\.\s*register/.test(text)).map(([file]) => file);
    expect(registering).toEqual([]);
  });
});
