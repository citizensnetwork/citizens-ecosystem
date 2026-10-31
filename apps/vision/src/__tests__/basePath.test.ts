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
import { appPath, resolveBasePath } from "@citizens/ecosystem";

const ENV = "NEXT_PUBLIC_BASE_PATH";
const saved = process.env[ENV];

afterEach(() => {
  if (saved === undefined) delete process.env[ENV];
  else process.env[ENV] = saved;
  vi.resetModules();
});

type Config = {
  basePath?: string;
  redirects?: () => Promise<{ source: string; destination: string; permanent: boolean }[]>;
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
    expect(prefixed).toEqual(plain);
    expect(prefixed).toEqual([{ source: "/", destination: "/index.html", permanent: false }]);
  });
});

describe("index.html under a prefix", () => {
  const html = fs.readFileSync(path.join(__dirname, "../frontend/index.html"), "utf8");

  it("loads everything by a relative URL and has no <base>, so it works from /citizens/vision/index.html as is", () => {
    const absolute = [...html.matchAll(/\s(?:src|href)="(\/[^"/][^"]*)"/g)].map((m) => m[1]);
    expect(absolute, `root-absolute src/href in index.html: ${absolute.join(", ")}`).toEqual([]);
    expect(html).not.toMatch(/<base\b/i);
  });
});
