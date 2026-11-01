/**
 * Serving Connect under /citizens/connect (PR A of the 219.co.za move).
 *
 * next.config.ts cannot import @citizens/ecosystem (Next 16 compiles it to CommonJS and Node 22 then
 * fails on a runtime import, see the note at the top of that file), so it carries a copy of the
 * package's rule. This file keeps the copy and the package identical, and checks the other half of
 * the contract: the real index.html has the one <base href="/"> tag the build rewrites.
 *
 * With NEXT_PUBLIC_BASE_PATH unset (production today) none of this may change anything.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { appPath, oldAddressRules, resolveBasePath } from "@citizens/ecosystem";
import { rewriteIndexHtml } from "@citizens/frontend-build";

const ENV = "NEXT_PUBLIC_BASE_PATH";
const ORIGIN_ENV = "HUB_ORIGIN_CONNECT";
const saved = process.env[ENV];
const savedOrigin = process.env[ORIGIN_ENV];

afterEach(() => {
  if (saved === undefined) delete process.env[ENV];
  else process.env[ENV] = saved;
  if (savedOrigin === undefined) delete process.env[ORIGIN_ENV];
  else process.env[ORIGIN_ENV] = savedOrigin;
  vi.resetModules();
});

type Config = {
  basePath?: string;
  redirects?: () => Promise<{ source: string; destination: string; permanent: boolean }[]>;
  rewrites?: () => Promise<{ source: string; destination: string }[]>;
  headers?: () => Promise<{ source: string; headers: { key: string }[] }[]>;
};

/** next.config.ts, freshly evaluated with NEXT_PUBLIC_BASE_PATH set to `raw` (undefined = unset). */
async function load(raw: string | undefined): Promise<Config> {
  if (raw === undefined) delete process.env[ENV];
  else process.env[ENV] = raw;
  vi.resetModules();
  return (await import("../../../next.config")).default as Config;
}

const VALUES: (string | undefined)[] = [
  undefined,
  "",
  "   ",
  "/",
  "/citizens/connect",
  "/citizens/connect/",
  " /citizens/connect ",
  "/citizens/connect\n",
  "/citizens/wear",
  "/citizens/vision",
  "/citizens",
  "citizens/connect",
  "//evil.example",
  "/Citizens/Connect",
  "/citizens/connect//",
  "/citizens/connect/extra",
  "https://219.co.za/citizens/connect",
];

describe("next.config.ts basePath", () => {
  it("adds no basePath key at all when unset: the config is exactly what it was", async () => {
    for (const raw of [undefined, "", "  ", "/"]) {
      const config = await load(raw);
      expect("basePath" in config, JSON.stringify(raw)).toBe(false);
    }
  });

  it("serves from /citizens/connect when set to that", async () => {
    expect((await load("/citizens/connect")).basePath).toBe("/citizens/connect");
    expect((await load("/citizens/connect/")).basePath).toBe("/citizens/connect");
  });

  it.each(VALUES)("agrees with @citizens/ecosystem for %j (value, or the exact error)", async (raw) => {
    let expected: { value: string } | { error: string };
    try {
      expected = { value: resolveBasePath("connect", raw) };
    } catch (e) {
      expected = { error: (e as Error).message };
    }

    if ("error" in expected) {
      await expect(load(raw)).rejects.toThrow(expected.error);
    } else {
      const config = await load(raw);
      expect(config.basePath ?? "").toBe(expected.value);
    }
  });

  it("uses the registry's own path for Connect", async () => {
    expect((await load(appPath("connect"))).basePath).toBe("/citizens/connect");
  });

  it("sends the security headers on the bare prefix too: the rule is /:path*, never /(.*)", async () => {
    // Under a basePath Next prefixes the pattern. "/citizens/connect/(.*)" needs a slash after the prefix, so
    // the app's front door, plain "/citizens/connect", was served with no CSP, HSTS or X-Frame-Options
    // (found by a real `next start` probe). "/citizens/connect/:path*" matches it.
    for (const raw of [undefined, "/citizens/connect"]) {
      const rules = await (await load(raw)).headers!();
      expect(rules.map((r) => r.source), JSON.stringify(raw)).toEqual(["/:path*"]);
      const keys = rules[0].headers.map((h) => h.key);
      expect(keys).toEqual(
        expect.arrayContaining(["Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options"]),
      );
    }
  });

  it("leaves the route rewrites alone: Next prefixes them, they must not carry the prefix themselves", async () => {
    const plain = await (await load(undefined)).rewrites!();
    const prefixed = await (await load("/citizens/connect")).rewrites!();
    // Under the prefix the same screens are followed by the one old-address rewrite (/api/*), nothing else.
    expect(prefixed.slice(0, plain.length)).toEqual(plain);
    expect(prefixed).toHaveLength(plain.length + 1);
    for (const r of plain) expect(r.destination, r.source).toBe("/index.html");
  });
});

describe("old addresses (next.config.ts)", () => {
  it("adds nothing at all when the prefix is unset: no redirects() key, and the rewrites are only the screens", async () => {
    for (const raw of [undefined, "", "/"]) {
      const config = await load(raw);
      expect("redirects" in config, JSON.stringify(raw)).toBe(false);
      for (const r of await config.rewrites!()) {
        expect(r.destination, r.source).toBe("/index.html");
        expect(r, r.source).not.toHaveProperty("basePath");
      }
    }
  });

  it("does not even read HUB_ORIGIN_CONNECT while the prefix is unset (a bad value cannot break today's build)", async () => {
    process.env[ORIGIN_ENV] = "not a url";
    await expect(load(undefined)).resolves.toBeDefined();
  });

  const ORIGINS: (string | undefined)[] = [
    undefined,
    "",
    "  ",
    "https://connect-test.vercel.app",
    " https://connect-test.vercel.app/ ",
    "http://127.0.0.1:4010",
    "http://localhost:4010",
    "http://example.vercel.app",
    "https://example.vercel.app/citizens/connect",
    "https://example.vercel.app?x=1",
    "https://user:pass@example.vercel.app",
    "example.vercel.app",
    "javascript:alert(1)",
  ];

  it.each(ORIGINS)("is the same rule as @citizens/ecosystem's oldAddressRules for HUB_ORIGIN_CONNECT=%j (rules, or the exact error)", async (origin) => {
    if (origin === undefined) delete process.env[ORIGIN_ENV];
    else process.env[ORIGIN_ENV] = origin;

    let expected: { rules: ReturnType<typeof oldAddressRules> } | { error: string };
    try {
      expected = { rules: oldAddressRules("connect", "/citizens/connect", process.env) };
    } catch (e) {
      expected = { error: (e as Error).message };
    }

    if ("error" in expected) {
      await expect(load("/citizens/connect")).rejects.toThrow(expected.error);
      return;
    }
    const config = await load("/citizens/connect");
    expect(await config.redirects!()).toEqual(expected.rules.redirects);
    expect((await config.rewrites!()).slice(-expected.rules.rewrites.length)).toEqual(expected.rules.rewrites);
  });

  it("redirects the old host's pages (QR codes, /index.html?c=, /dashboard) and rewrites its /api", async () => {
    delete process.env[ORIGIN_ENV];
    const config = await load("/citizens/connect");
    const redirects = await config.redirects!();
    expect(redirects.map((r) => [r.source, r.destination, r.permanent])).toEqual([
      ["/", "https://219.co.za/citizens/connect", true],
      ["/:path((?!api(?:/|$)|_next(?:/|$)|citizens(?:/|$)).+)", "https://219.co.za/citizens/connect/:path", true],
      ["/", "/citizens/connect", false],
    ]);
    const rewrites = await config.rewrites!();
    expect(rewrites.at(-1)).toEqual({
      source: "/api/:path*",
      basePath: false,
      destination: "https://citizens-ecosystem-connect.vercel.app/citizens/connect/api/:path*",
    });
  });
});

describe("index.html <base> tag", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../frontend/index.html"), "utf8");
  const FILES = {
    bundleFile: "bundle.0123456789.js",
    authClientFile: "auth-client.0123456789.js",
    capacitorBridgeFile: "capacitor-bridge.0123456789.js",
  };

  it('has exactly one <base href="/"> for the build to rewrite (no silent no-op)', () => {
    expect(html.match(/<base\b/gi)).toHaveLength(1);
    expect(html).toMatch(/<base\s+href="\/"\s*\/?>/i);
  });

  it("the build turns it into the prefix, and leaves it alone without one", () => {
    expect(rewriteIndexHtml(html, { ...FILES, basePath: "/citizens/connect" })).toMatch(
      /<base\s+href="\/citizens\/connect\/"\s*\/?>/i,
    );
    expect(rewriteIndexHtml(html, FILES)).toMatch(/<base\s+href="\/"\s*\/?>/i);
  });

  it("names its own icon by a RELATIVE URL (the domain root belongs to the front door), and the file is there to serve", () => {
    // Browsers ask the domain root for /favicon.ico when a page names no icon; under one shared domain that root is
    // the front door's, so each app names its own. Relative, so it follows <base> to /citizens/connect/icons/ under
    // the prefix and stays /icons/ at the root today.
    expect(html.match(/<link\b[^>]*\brel="icon"[^>]*>/g)).toEqual([
      '<link rel="icon" href="icons/icon.svg" type="image/svg+xml" />',
    ]);
    // public/icons/icon.svg is tracked in git (the build copies src/frontend over it but never deletes it).
    expect(fs.readFileSync(path.join(__dirname, "../../../public/icons/icon.svg"), "utf8")).toMatch(/^<svg\b/);
  });

  it("every other URL in the page is relative, so the base tag is what moves them under the prefix", () => {
    const absolute = [...html.matchAll(/\s(?:src|href)="(\/[^"/][^"]*)"/g)].map((m) => m[1]);
    expect(absolute, `root-absolute src/href in index.html: ${absolute.join(", ")}`).toEqual([]);
  });
});
