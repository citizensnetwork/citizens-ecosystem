/**
 * Serving Vision under /citizens/vision (PR A of the 219.co.za move).
 *
 * next.config.ts cannot import @citizens/ecosystem (Next 16 compiles it to CommonJS and Node 22 then
 * fails on a runtime import), so it carries a copy of the package's rule. This file keeps the copy and
 * the package identical. With NEXT_PUBLIC_BASE_PATH unset (production today) nothing may change.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { appPath, oldAddressRules, resolveBasePath } from "@citizens/ecosystem";

const ENV = "NEXT_PUBLIC_BASE_PATH";
const ORIGIN_ENV = "HUB_ORIGIN_VISION";
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
  rewrites?: () => Promise<{ source: string; destination: string; basePath?: false }[]>;
  headers?: () => Promise<{ source: string; headers: { key: string }[] }[]>;
};

/** next.config.ts, freshly evaluated with NEXT_PUBLIC_BASE_PATH set to `raw` (undefined = unset). */
async function load(raw: string | undefined): Promise<Config> {
  if (raw === undefined) delete process.env[ENV];
  else process.env[ENV] = raw;
  vi.resetModules();
  return (await import("../../next.config")).default as Config;
}

const VALUES: (string | undefined)[] = [
  undefined,
  "",
  "   ",
  "/",
  "/citizens/vision",
  "/citizens/vision/",
  " /citizens/vision ",
  "/citizens/vision\n",
  "/citizens/connect",
  "/citizens/wear",
  "/citizens",
  "citizens/vision",
  "//evil.example",
  "/Citizens/Vision",
  "/citizens/vision//",
  "/citizens/vision/extra",
  "https://219.co.za/citizens/vision",
];

describe("next.config.ts basePath", () => {
  it("adds no basePath key at all when unset: the config is exactly what it was", async () => {
    for (const raw of [undefined, "", "  ", "/"]) {
      const config = await load(raw);
      expect("basePath" in config, JSON.stringify(raw)).toBe(false);
    }
  });

  it("serves from /citizens/vision when set to that", async () => {
    expect((await load("/citizens/vision")).basePath).toBe("/citizens/vision");
    expect((await load("/citizens/vision/")).basePath).toBe("/citizens/vision");
  });

  it.each(VALUES)("agrees with @citizens/ecosystem for %j (value, or the exact error)", async (raw) => {
    let expected: { value: string } | { error: string };
    try {
      expected = { value: resolveBasePath("vision", raw) };
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

  it("uses the registry's own path for Vision", async () => {
    expect((await load(appPath("vision"))).basePath).toBe("/citizens/vision");
  });

  it("sends the security headers on the bare prefix too: the rule is /:path*, never /(.*)", async () => {
    // Under a basePath Next prefixes the pattern. "/citizens/vision/(.*)" needs a slash after the prefix, so
    // plain "/citizens/vision" got no headers. "/citizens/vision/:path*" matches it (Wear already did this).
    for (const raw of [undefined, "/citizens/vision"]) {
      const rules = await (await load(raw)).headers!();
      expect(rules.map((r) => r.source), JSON.stringify(raw)).toEqual(["/:path*"]);
      const keys = rules[0].headers.map((h) => h.key);
      expect(keys).toEqual(
        expect.arrayContaining(["Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options"]),
      );
    }
  });

  it('keeps the "/" redirect unprefixed: Next adds the prefix to source and destination itself', async () => {
    const plain = await (await load(undefined)).redirects!();
    const prefixed = await (await load("/citizens/vision")).redirects!();
    // Under the prefix the same first rule is followed by the old-address rule (see the next describe).
    expect(prefixed[0]).toEqual(plain[0]);
    expect(plain).toEqual([{ source: "/", destination: "/index.html", permanent: false }]);
  });
});

describe("old addresses (next.config.ts)", () => {
  it("adds nothing at all when the prefix is unset: no rewrites() key, and redirects() is exactly today's", async () => {
    for (const raw of [undefined, "", "/"]) {
      const config = await load(raw);
      expect("rewrites" in config, JSON.stringify(raw)).toBe(false);
      expect(await config.redirects!(), JSON.stringify(raw)).toEqual([
        { source: "/", destination: "/index.html", permanent: false },
      ]);
    }
  });

  it("does not even read HUB_ORIGIN_VISION while the prefix is unset (a bad value cannot break today's build)", async () => {
    process.env[ORIGIN_ENV] = "not a url";
    await expect(load(undefined)).resolves.toBeDefined();
  });

  const ORIGINS: (string | undefined)[] = [
    undefined,
    "",
    "  ",
    "https://vision-test.vercel.app",
    " https://vision-test.vercel.app/ ",
    "http://127.0.0.1:4010",
    "http://localhost:4010",
    "http://example.vercel.app",
    "https://example.vercel.app/citizens/vision",
    "https://example.vercel.app?x=1",
    "https://user:pass@example.vercel.app",
    "example.vercel.app",
    "javascript:alert(1)",
  ];

  it.each(ORIGINS)("is the same rule as @citizens/ecosystem's oldAddressRules for HUB_ORIGIN_VISION=%j (rules, or the exact error)", async (origin) => {
    if (origin === undefined) delete process.env[ORIGIN_ENV];
    else process.env[ORIGIN_ENV] = origin;

    let expected: { rules: ReturnType<typeof oldAddressRules> } | { error: string };
    try {
      expected = { rules: oldAddressRules("vision", "/citizens/vision", process.env) };
    } catch (e) {
      expected = { error: (e as Error).message };
    }

    if ("error" in expected) {
      await expect(load("/citizens/vision")).rejects.toThrow(expected.error);
      return;
    }
    const config = await load("/citizens/vision");
    expect(await config.redirects!()).toEqual([
      { source: "/", destination: "/index.html", permanent: false },
      ...expected.rules.redirects,
    ]);
    expect(await config.rewrites!()).toEqual(expected.rules.rewrites);
  });

  it("sends a bare / to the prefix and /api/* to the app's own production route", async () => {
    delete process.env[ORIGIN_ENV];
    const config = await load("/citizens/vision");
    expect(await config.redirects!()).toContainEqual({
      source: "/",
      basePath: false,
      destination: "/citizens/vision",
      permanent: false,
    });
    expect(await config.rewrites!()).toEqual([
      {
        source: "/api/:path*",
        basePath: false,
        destination: "https://citizens-ecosystem-vision.vercel.app/citizens/vision/api/:path*",
      },
    ]);
  });
});

describe("index.html under a prefix", () => {
  const html = fs.readFileSync(path.join(__dirname, "../frontend/index.html"), "utf8");

  it("names its own icon by a RELATIVE URL (the domain root belongs to the front door), and ships the file", () => {
    // Browsers ask the domain root for /favicon.ico when a page names no icon; under one shared domain that root is
    // the front door's, so each app names its own. Relative: /citizens/vision/icons/icon.svg under the prefix.
    expect(html.match(/<link\b[^>]*\brel="icon"[^>]*>/g)).toEqual([
      '<link rel="icon" href="icons/icon.svg" type="image/svg+xml" />',
    ]);
    expect(fs.readFileSync(path.join(__dirname, "../frontend/icons/icon.svg"), "utf8")).toMatch(/^<svg\b/);
  });

  it("loads everything by a relative URL and has no <base>, so it works from /citizens/vision/index.html as is", () => {
    const absolute = [...html.matchAll(/\s(?:src|href)="(\/[^"/][^"]*)"/g)].map((m) => m[1]);
    expect(absolute, `root-absolute src/href in index.html: ${absolute.join(", ")}`).toEqual([]);
    expect(html).not.toMatch(/<base\b/i);
  });
});
