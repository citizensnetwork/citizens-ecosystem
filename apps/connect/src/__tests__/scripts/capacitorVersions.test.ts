/**
 * Capacitor's own packages move together (QA fix plan PR G; QA row CC-08). `@capacitor/android` sat at ~8.4.3 while
 * core, cli and ios were on ~8.5.3 (capped back during the 2026-10 OSV hygiene work); a shell built from mixed minors
 * can load a bridge its native side does not match. This file fails if they drift apart again, in package.json or in
 * what pnpm installed.
 *
 * It also checks the Android project names every Capacitor plugin the app uses. Until 2026-11-25 the committed
 * Gradle files predated @capacitor/app and @capacitor/browser, so on Android `appUrlOpen` (app links, the sign-in
 * callback) could never have fired. `npx cap sync android` regenerates both files; the plugin paths stay in the
 * stable `../node_modules/@capacitor/<name>` form (the app's own links), never pnpm's versioned store path.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const APP = process.cwd();
const pkg = JSON.parse(readFileSync(join(APP, "package.json"), "utf8")) as { dependencies: Record<string, string> };
const CORE = ["@capacitor/core", "@capacitor/cli", "@capacitor/android", "@capacitor/ios"];
const minorOf = (v: string) => /(\d+)\.(\d+)\./.exec(v)?.slice(1, 3).join(".");
const installed = (name: string) =>
  (JSON.parse(readFileSync(join(APP, "node_modules", name, "package.json"), "utf8")) as { version: string }).version;

describe("Capacitor's core packages share one minor", () => {
  it("in package.json, each pinned with ~ (patches only)", () => {
    const specs = CORE.map((name) => pkg.dependencies[name] ?? "");
    for (const [i, spec] of specs.entries()) expect(spec, CORE[i]).toMatch(/^~\d+\.\d+\.\d+$/);
    expect(new Set(specs.map(minorOf)).size).toBe(1);
  });

  it("as installed", () => {
    expect(new Set(CORE.map((name) => minorOf(installed(name)))).size).toBe(1);
  });
});

describe("the Android project names every Capacitor plugin the app uses", () => {
  const settings = readFileSync(join(APP, "android/capacitor.settings.gradle"), "utf8");
  const build = readFileSync(join(APP, "android/app/capacitor.build.gradle"), "utf8");
  const plugins = Object.keys(pkg.dependencies).filter(
    (name) => name.startsWith("@capacitor/") && existsSync(join(APP, "node_modules", name, "android")),
  );

  it("finds the plugins it checks (app and browser among them)", () => {
    expect(plugins).toEqual(expect.arrayContaining(["@capacitor/app", "@capacitor/browser"]));
  });

  it.each(plugins.map((name) => [name]))("%s is included and depended on", (name) => {
    const project = `capacitor-${name.slice("@capacitor/".length)}`;
    expect(settings).toContain(`include ':${project}'`);
    expect(settings).toContain(`project(':${project}').projectDir = new File('../node_modules/${name}/android')`);
    expect(build).toContain(`implementation project(':${project}')`);
  });

  it("uses the app's own node_modules links, never a versioned pnpm store path", () => {
    expect(settings).not.toContain(".pnpm");
    expect(settings).toContain("new File('../node_modules/@capacitor/android/capacitor')");
  });
});
