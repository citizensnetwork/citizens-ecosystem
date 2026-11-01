/**
 * The address a person can SHARE or print as a QR code (CC_ROUTES.publicUrl in routes.jsx).
 *
 * Web and native differ: a web page shares its own origin plus the web prefix; the Capacitor shell's origin is
 * not an address anyone can open and its bundle sits at the shell's root, so it shares the PUBLIC site from the
 * mobile build's config.js (PUBLIC_ORIGIN + PUBLIC_BASE_PATH). With no config the native link is exactly what it
 * was before the keys existed (https://www.citizenscentral.co.za + path), and a web link never changes.
 *
 * The callers (store.jsx shareLink, map-v2-sheet.jsx QR) are pinned at the end: neither may build a link by hand.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFrontend } from "./support/loadFrontend";

type Opts = { native?: boolean; webOrigin?: string } | undefined;
type Routes = {
  publicUrl: (path: unknown, opts?: Opts) => string | null;
  appUrl: (path: string) => string;
  PUBLIC_ORIGIN: string;
  PUBLIC_BASE_PATH: string;
  BASE_PATH: string;
};

const load = (env: unknown) => loadFrontend("routes.jsx", env === undefined ? {} : { __CC_ENV: env }).CC_ROUTES as Routes;

const TODAY = "https://www.citizenscentral.co.za";
const CUTOVER = { PUBLIC_ORIGIN: "https://219.co.za", PUBLIC_BASE_PATH: "/citizens/connect" };
const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";
// Every path shape pathFor can produce, a query and a hash included.
const PATHS = ["/", "/discover", "/c/grace-church", `/e/${UUID}`, `/p/${UUID}`, "/dashboard/events", `/messages/${UUID}`, "/c/x?ref=qr", "/explore#top"];

describe("web links", () => {
  const ORIGIN = "https://preview.example.org";

  it.each(PATHS)("with no prefix, %s is the page's own origin plus the path: exactly the old formula", (path) => {
    const R = load({ API_BASE_URL: "" });
    expect(R.publicUrl(path, { native: false, webOrigin: ORIGIN })).toBe(ORIGIN + path);
    expect(R.publicUrl(path, { native: false, webOrigin: ORIGIN })).toBe(ORIGIN + R.appUrl(path));
  });

  it.each(PATHS)("with the web prefix, %s carries it, exactly as appUrl does", (path) => {
    const R = load({ BASE_PATH: "/citizens/connect" });
    expect(R.publicUrl(path, { native: false, webOrigin: ORIGIN })).toBe(ORIGIN + R.appUrl(path));
  });

  it("with the web prefix the home page is the bare prefix, and a deep link sits under it", () => {
    const R = load({ BASE_PATH: "/citizens/connect" });
    expect(R.publicUrl("/", { webOrigin: ORIGIN })).toBe(`${ORIGIN}/citizens/connect`);
    expect(R.publicUrl("/c/grace-church", { webOrigin: ORIGIN })).toBe(`${ORIGIN}/citizens/connect/c/grace-church`);
  });

  it("the caller picks the origin: a share uses the page's, a printed QR code the public site's", () => {
    const R = load({ BASE_PATH: "/citizens/connect" });
    expect(R.publicUrl("/c/a", { webOrigin: ORIGIN })).toBe(`${ORIGIN}/citizens/connect/c/a`);
    expect(R.publicUrl("/c/a", { webOrigin: TODAY })).toBe(`${TODAY}/citizens/connect/c/a`);
  });

  it("never reads the mobile-only PUBLIC_* keys, even if a web config.js somehow has them", () => {
    const R = load({ ...CUTOVER });
    expect(R.publicUrl("/c/a", { native: false, webOrigin: ORIGIN })).toBe(`${ORIGIN}/c/a`);
    const prefixed = load({ ...CUTOVER, BASE_PATH: "/citizens/connect" });
    expect(prefixed.publicUrl("/c/a", { native: false, webOrigin: ORIGIN })).toBe(`${ORIGIN}/citizens/connect/c/a`);
  });

  it("is treated as web when native is absent or falsy", () => {
    const R = load({});
    for (const opts of [{ webOrigin: ORIGIN }, { native: false, webOrigin: ORIGIN }, { native: undefined, webOrigin: ORIGIN }]) {
      expect(R.publicUrl("/c/a", opts)).toBe(`${ORIGIN}/c/a`);
    }
  });

  it("has no link without an origin: null, never a bare path posing as a link", () => {
    const R = load({});
    for (const opts of [undefined, {}, { native: false }, { webOrigin: "" }, { webOrigin: 5 as unknown as string }]) {
      expect(R.publicUrl("/c/a", opts)).toBeNull();
    }
  });
});

describe("native links", () => {
  const native = { native: true, webOrigin: "capacitor://localhost" } as const;

  it.each(PATHS)("with no config, %s is today's public site plus the path: exactly what shipped before", (path) => {
    for (const env of [undefined, {}, { API_BASE_URL: "https://x.example", SUPABASE_URL: "https://y.example" }]) {
      const R = load(env);
      expect(R.publicUrl(path, native)).toBe(TODAY + path);
      expect(R.PUBLIC_ORIGIN).toBe(TODAY);
      expect(R.PUBLIC_BASE_PATH).toBe("");
    }
  });

  it("never uses the shell's own origin, whatever the caller passes", () => {
    const R = load({});
    for (const webOrigin of ["capacitor://localhost", "https://localhost", "http://localhost", undefined]) {
      expect(R.publicUrl("/c/a", { native: true, webOrigin })).toBe(`${TODAY}/c/a`);
    }
  });

  it("a custom origin alone replaces the site, with no prefix", () => {
    const R = load({ PUBLIC_ORIGIN: "https://219.co.za" });
    expect(R.publicUrl("/c/grace-church", native)).toBe("https://219.co.za/c/grace-church");
  });

  it("the cutover values give the one-domain address, for a deep link and for home", () => {
    const R = load({ ...CUTOVER });
    expect(R.publicUrl("/c/grace-church", native)).toBe("https://219.co.za/citizens/connect/c/grace-church");
    expect(R.publicUrl(`/e/${UUID}`, native)).toBe(`https://219.co.za/citizens/connect/e/${UUID}`);
    expect(R.publicUrl("/", native)).toBe("https://219.co.za/citizens/connect");
    expect(R.publicUrl("/c/x?ref=qr", native)).toBe("https://219.co.za/citizens/connect/c/x?ref=qr");
    expect(R.publicUrl("/explore#top", native)).toBe("https://219.co.za/citizens/connect/explore#top");
  });

  it("a prefix with the default origin works too (the site is still on the old domain, under a prefix)", () => {
    const R = load({ PUBLIC_BASE_PATH: "/citizens/connect" });
    expect(R.publicUrl("/c/a", native)).toBe(`${TODAY}/citizens/connect/c/a`);
  });

  it("the web prefix does not apply to the shell: only PUBLIC_BASE_PATH does", () => {
    const R = load({ BASE_PATH: "/citizens/connect" });
    expect(R.publicUrl("/c/a", native)).toBe(`${TODAY}/c/a`);
    const both = load({ BASE_PATH: "/citizens/connect", PUBLIC_ORIGIN: "https://219.co.za", PUBLIC_BASE_PATH: "/citizens/wear" });
    expect(both.publicUrl("/c/a", native)).toBe("https://219.co.za/citizens/wear/c/a");
  });

  it("a trailing slash on the base path is forgiven (a hand-written config.js)", () => {
    expect(load({ PUBLIC_BASE_PATH: "/citizens/connect/" }).PUBLIC_BASE_PATH).toBe("/citizens/connect");
  });

  it.each([
    ["an http origin", { PUBLIC_ORIGIN: "http://219.co.za" }],
    ["an origin with a path", { PUBLIC_ORIGIN: "https://219.co.za/citizens" }],
    ["an origin with a port", { PUBLIC_ORIGIN: "https://219.co.za:8443" }],
    ["an origin with credentials", { PUBLIC_ORIGIN: "https://user@219.co.za" }],
    ["an origin with a query", { PUBLIC_ORIGIN: "https://219.co.za?x=1" }],
    ["an origin with a backslash", { PUBLIC_ORIGIN: "https://evil.example\\@219.co.za" }],
    ["a bare host", { PUBLIC_ORIGIN: "219.co.za" }],
    ["an empty origin", { PUBLIC_ORIGIN: "" }],
    ["a non-string origin", { PUBLIC_ORIGIN: 5 }],
  ])("falls back to today's public site for %s", (_label, env) => {
    const R = load(env);
    expect(R.PUBLIC_ORIGIN).toBe(TODAY);
    expect(R.publicUrl("/c/a", native)).toBe(`${TODAY}/c/a`);
  });

  it.each([
    ["no leading slash", "citizens/connect"],
    ["a protocol-relative path", "//evil.example"],
    ["a bare slash", "/"],
    ["a query", "/x?y=1"],
    ["a hash", "/x#y"],
    ["a backslash", "/x\\y"],
    ["whitespace", "/x y"],
    ["a non-string", 5],
    ["empty", ""],
  ])("ignores a base path with %s", (_label, PUBLIC_BASE_PATH) => {
    const R = load({ PUBLIC_BASE_PATH });
    expect(R.PUBLIC_BASE_PATH).toBe("");
    expect(R.publicUrl("/c/a", native)).toBe(`${TODAY}/c/a`);
  });
});

describe("paths that are not a plain app path", () => {
  it.each([null, undefined, 5, {}, "", "c/a", "//evil.example/c/a", "https://evil.example/c/a"])("%j is null for web and native alike", (path) => {
    const R = load({ ...CUTOVER });
    expect(R.publicUrl(path, { native: true })).toBeNull();
    expect(R.publicUrl(path, { native: false, webOrigin: "https://x.example" })).toBeNull();
  });
});

describe("the callers build no link by hand", () => {
  const read = (file: string) => readFileSync(join(process.cwd(), "src/frontend/app", file), "utf8");

  it("store.jsx shareLink asks publicUrl, for web and native, and keeps no public origin of its own", () => {
    const src = read("store.jsx");
    const body = src.slice(src.indexOf("const shareLink = useCallback"), src.indexOf("const updateAvatar"));
    expect(body).toContain("ROUTES.publicUrl(path, { native: isNative, webOrigin: window.location.origin })");
    expect(body).not.toMatch(/['"`]https:\/\/www\.citizenscentral/);
    expect(body).not.toMatch(/window\.location\.origin\s*\+/);
  });

  it("the listing sheet's QR code asks publicUrl with the public site as its web origin, and the phone's native flag", () => {
    const src = read("map-v2-sheet.jsx");
    const at = src.indexOf("window.CC_ROUTES.publicUrl(");
    expect(at).toBeGreaterThan(-1);
    const call = src.slice(at, src.indexOf("name, slug:", at));
    expect(call).toContain("window.CapCore.isNativePlatform()");
    expect(call).toContain("webOrigin: window.MapV2QR.PUBLIC_ORIGIN");
    expect(src).not.toMatch(/window\.MapV2QR\.PUBLIC_ORIGIN\s*\+/);
  });

  it("the web QR origin constant is unchanged: a printed web code always opens the public site", () => {
    expect(read("map-v2-qr.jsx")).toContain("const PUBLIC_ORIGIN = 'https://www.citizenscentral.co.za';");
  });

  it("the phone app's default public origin matches the QR constant, so an unset build behaves as before", () => {
    const qr = /const PUBLIC_ORIGIN = '([^']+)';/.exec(read("map-v2-qr.jsx"));
    const routes = /const DEFAULT_PUBLIC_ORIGIN = '([^']+)';/.exec(read("routes.jsx"));
    expect(routes?.[1]).toBe(qr?.[1]);
  });
});
