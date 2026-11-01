// @vitest-environment node
/**
 * The phone app's build-time config (scripts/frontend-config.js, run by scripts/build-frontend.js --mobile):
 * the API base it calls and the PUBLIC web address its share and QR links use.
 *
 * These run Connect's REAL configuration through the REAL pipeline into temp directories (nothing is written
 * into public/ or mobile-dist/), so they catch what a unit test of one function cannot: a key in the wrong
 * build, a default that drifted, a bad value that is accepted. Every default must equal today's behaviour; the
 * 219.co.za cutover values only take effect when a build sets them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as esbuild from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { buildFrontend } from "@citizens/frontend-build";
import type { BuildFrontendOptions } from "@citizens/frontend-build";

vi.setConfig({ testTimeout: 120_000 });

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const frontendConfig = require(path.join(ROOT, "scripts", "frontend-config.js")) as Omit<BuildFrontendOptions, "esbuild" | "rootDir" | "appFileOrder">;

// The screen load order stays in build-frontend.js (a dozen wiring tests read that file's text), so read it from there.
const buildScript = fs.readFileSync(path.join(ROOT, "scripts", "build-frontend.js"), "utf8");
const appFileOrderSource = /appFileOrder:\s*\[([\s\S]*?)\]\s*,/.exec(buildScript)?.[1] ?? "";
const appFileOrder = [...appFileOrderSource.matchAll(/'([^']+\.jsx)'/g)].map((m) => m[1]);

const LIVE_API = "https://citizens-ecosystem-connect.vercel.app";
const DEAD_API = "https://citizens-connect.vercel.app";
const TODAY_PUBLIC = "https://www.citizenscentral.co.za";
const CUTOVER = {
  MOBILE_API_BASE_URL: "https://219.co.za/citizens/connect",
  MOBILE_PUBLIC_ORIGIN: "https://219.co.za",
  MOBILE_PUBLIC_BASE_PATH: "/citizens/connect",
};

let publicDir: string;
let mobileDir: string;

beforeEach(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cc-native-config-"));
  publicDir = path.join(tmp, "public");
  mobileDir = path.join(tmp, "mobile-dist");
});

afterEach(() => {
  fs.rmSync(path.dirname(publicDir), { recursive: true, force: true });
});

/** Run the real Connect build; `env` is the whole environment the build sees (no leaks from this machine's). */
function build(mobile: boolean, env: Record<string, string> = {}, extra: Partial<BuildFrontendOptions> = {}) {
  return buildFrontend({
    ...frontendConfig,
    appFileOrder,
    esbuild,
    rootDir: ROOT,
    publicDir,
    mobileDir,
    mobile,
    env,
    log: vi.fn(),
    warn: vi.fn(),
    ...extra,
  });
}

/** The config.js a build wrote, evaluated the way the page does. */
function writtenConfig(dest: string): Record<string, string> {
  const win: Record<string, Record<string, string>> = {};
  new Function("window", fs.readFileSync(path.join(dest, "config.js"), "utf8"))(win);
  return win.__CC_ENV;
}

describe("the defaults are today's behaviour", () => {
  it("a mobile build with no MOBILE_* values: the live API alias, today's public site, no prefix", () => {
    const result = build(true);
    const cfg = writtenConfig(result.dest);
    expect(result.dest).toBe(mobileDir);
    expect(cfg.API_BASE_URL).toBe(LIVE_API);
    expect(cfg.PUBLIC_ORIGIN).toBe(TODAY_PUBLIC);
    expect(cfg.PUBLIC_BASE_PATH).toBe("");
    expect(Object.keys(cfg)).toEqual([
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "API_BASE_URL",
      "MAPTILER_KEY",
      "MAPTILER_STYLE",
      "PUBLIC_ORIGIN",
      "PUBLIC_BASE_PATH",
    ]);
  });

  it("the default API base is not the dead host the build used to point at", () => {
    const cfg = writtenConfig(build(true).dest);
    expect(cfg.API_BASE_URL).not.toBe(DEAD_API);
    expect(JSON.stringify(frontendConfig.configVars)).not.toContain("citizens-connect.vercel.app");
  });

  it("a web build leaves the two public keys out entirely: its config.js is what it always was", () => {
    const cfg = writtenConfig(build(false).dest);
    expect(Object.keys(cfg)).toEqual(["SUPABASE_URL", "SUPABASE_ANON_KEY", "API_BASE_URL", "MAPTILER_KEY", "MAPTILER_STYLE"]);
    expect(cfg.API_BASE_URL).toBe("");
    expect(cfg.MAPTILER_STYLE).toBe("streets-v2");
  });

  it("a web build never reads MOBILE_* values: even malformed ones cannot fail it", () => {
    const cfg = writtenConfig(build(false, { MOBILE_PUBLIC_ORIGIN: "http://nope", MOBILE_PUBLIC_BASE_PATH: "x" }).dest);
    expect(cfg).not.toHaveProperty("PUBLIC_ORIGIN");
    expect(cfg).not.toHaveProperty("PUBLIC_BASE_PATH");
  });

  it("a web build under the prefix still adds only BASE_PATH (the mobile keys stay out)", () => {
    const cfg = writtenConfig(build(false, {}, { basePath: "/citizens/connect" }).dest);
    expect(Object.keys(cfg)).toEqual(["SUPABASE_URL", "SUPABASE_ANON_KEY", "API_BASE_URL", "MAPTILER_KEY", "MAPTILER_STYLE", "BASE_PATH"]);
  });
});

describe("the 219.co.za cutover values", () => {
  it("a mobile build carries all three, in config.js and in the result", () => {
    const result = build(true, CUTOVER);
    const cfg = writtenConfig(result.dest);
    expect(cfg.API_BASE_URL).toBe("https://219.co.za/citizens/connect");
    expect(cfg.PUBLIC_ORIGIN).toBe("https://219.co.za");
    expect(cfg.PUBLIC_BASE_PATH).toBe("/citizens/connect");
    expect(result.config).toEqual(cfg);
  });

  it("each value is independent: setting one leaves the others at their defaults", () => {
    const only = writtenConfig(build(true, { MOBILE_PUBLIC_ORIGIN: "https://219.co.za" }).dest);
    expect(only.PUBLIC_ORIGIN).toBe("https://219.co.za");
    expect(only.PUBLIC_BASE_PATH).toBe("");
    expect(only.API_BASE_URL).toBe(LIVE_API);
  });

  it("the web prefix setting (NEXT_PUBLIC_BASE_PATH) does not leak into a mobile build", () => {
    const cfg = writtenConfig(build(true, {}, { basePath: "/citizens/connect" }).dest);
    expect(cfg).not.toHaveProperty("BASE_PATH");
    expect(cfg.PUBLIC_BASE_PATH).toBe("");
  });
});

describe("a bad value fails the build before anything is written", () => {
  it.each([
    ["MOBILE_PUBLIC_ORIGIN", "http://219.co.za", /PUBLIC_ORIGIN \(MOBILE_PUBLIC_ORIGIN\) must be an https origin/],
    ["MOBILE_PUBLIC_ORIGIN", "https://219.co.za/", /PUBLIC_ORIGIN/],
    ["MOBILE_PUBLIC_ORIGIN", "https://219.co.za/citizens/connect", /PUBLIC_ORIGIN/],
    ["MOBILE_PUBLIC_ORIGIN", "https://219.co.za:8443", /PUBLIC_ORIGIN/],
    ["MOBILE_PUBLIC_ORIGIN", "https://user:pw@219.co.za", /PUBLIC_ORIGIN/],
    ["MOBILE_PUBLIC_ORIGIN", "https://localhost", /PUBLIC_ORIGIN/],
    ["MOBILE_PUBLIC_BASE_PATH", "/citizens/connect/", /PUBLIC_BASE_PATH \(MOBILE_PUBLIC_BASE_PATH\) must be a path/],
    ["MOBILE_PUBLIC_BASE_PATH", "citizens/connect", /PUBLIC_BASE_PATH/],
    ["MOBILE_PUBLIC_BASE_PATH", "/Citizens/Connect", /PUBLIC_BASE_PATH/],
    ["MOBILE_PUBLIC_BASE_PATH", "/", /PUBLIC_BASE_PATH/],
    // What Git Bash makes of "/citizens/connect" when MSYS path conversion is not switched off.
    ["MOBILE_PUBLIC_BASE_PATH", "C:/Program Files/Git/citizens/connect", /PUBLIC_BASE_PATH/],
  ])("%s=%j", (name, value, message) => {
    expect(() => build(true, { [name]: value })).toThrow(message);
    expect(fs.existsSync(mobileDir)).toBe(false);
    expect(fs.existsSync(publicDir)).toBe(false);
  });
});

describe("the build script uses the configuration this file tests", () => {
  it("build-frontend.js spreads ./frontend-config.js and keeps no configVars of its own", () => {
    expect(buildScript).toContain("require('./frontend-config')");
    expect(buildScript).toMatch(/\.\.\.frontendConfig/);
    expect(buildScript).not.toContain("configVars");
    expect(buildScript).not.toContain("mobileDefault");
  });

  it("the screen load order the tests build with is the whole list (a regex that read none would build nothing)", () => {
    expect(appFileOrder.length).toBeGreaterThan(40);
    expect(appFileOrder[0]).toBe("icons.jsx");
    expect(appFileOrder.at(-1)).toBe("app.jsx");
    for (const f of appFileOrder) expect(fs.existsSync(path.join(ROOT, "src", "frontend", "app", f)), f).toBe(true);
  });
});
