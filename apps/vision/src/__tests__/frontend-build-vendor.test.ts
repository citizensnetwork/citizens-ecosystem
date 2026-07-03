// @vitest-environment node
// (esbuild refuses to run under jsdom — its TextEncoder Uint8Array invariant
// fails across realms; this suite is pure fs/build tooling anyway.)
/**
 * Guards the vendored @citizens/frontend-build copy (vendor/, consumed via a
 * file: dependency because Vision deploys from this repo alone — see
 * vendor/README.md):
 *
 *  1. Drift check — when the canonical source (the sibling citizens-wear
 *     checkout) is present, every vendored file must match it byte-for-byte
 *     (EOL-normalized). Skipped on machines/CI without the sibling repo.
 *  2. Smoke check — the vendored pipeline actually runs with Vision's own
 *     pinned esbuild (the injection contract the package is built around).
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

const VENDOR_DIR = path.resolve(__dirname, "../../vendor/citizens-frontend-build");
const CANONICAL_DIR = path.resolve(
  __dirname,
  "../../../citizens-wear/packages/frontend-build"
);
// index.js/index.d.ts/README.md are vendored verbatim; package.json is reduced
// to publish-relevant fields by scripts/sync-frontend-build.js (npm resolves a
// file: dependency like a workspace link, so the canonical workspace:* devDeps
// cannot be carried over).
const VERBATIM_FILES = ["index.js", "index.d.ts", "README.md"];
const PKG_FIELDS = ["name", "version", "private", "description", "main", "types", "files", "peerDependencies"] as const;

const canonicalPresent = fs.existsSync(CANONICAL_DIR);

const normalizeEol = (s: string) => s.replace(/\r\n/g, "\n");

describe("vendored @citizens/frontend-build", () => {
  it("is present and resolvable as a dependency", () => {
    for (const name of [...VERBATIM_FILES, "package.json"]) {
      expect(fs.existsSync(path.join(VENDOR_DIR, name)), `vendor file ${name}`).toBe(true);
    }
    const pkg = require("@citizens/frontend-build");
    expect(typeof pkg.buildFrontend).toBe("function");
  });

  it.skipIf(!canonicalPresent)(
    "matches the canonical source in citizens-wear (run `npm run sync:frontend-build` if this fails)",
    () => {
      for (const name of VERBATIM_FILES) {
        const vendored = normalizeEol(fs.readFileSync(path.join(VENDOR_DIR, name), "utf8"));
        const canonical = normalizeEol(fs.readFileSync(path.join(CANONICAL_DIR, name), "utf8"));
        expect(vendored, `${name} drifted from canonical`).toBe(canonical);
      }
      const vendoredPkg = JSON.parse(fs.readFileSync(path.join(VENDOR_DIR, "package.json"), "utf8"));
      const canonicalPkg = JSON.parse(fs.readFileSync(path.join(CANONICAL_DIR, "package.json"), "utf8"));
      for (const field of PKG_FIELDS) {
        expect(vendoredPkg[field], `package.json field ${field} drifted`).toEqual(canonicalPkg[field]);
      }
      // Nothing beyond the reduced field set may creep into the vendored copy.
      expect(Object.keys(vendoredPkg).sort()).toEqual(
        PKG_FIELDS.filter((f) => f in canonicalPkg).slice().sort()
      );
    }
  );

  it("runs the pipeline with Vision's own esbuild (injection smoke test)", () => {
    const { buildFrontend } = require("@citizens/frontend-build");
    const esbuild = require("esbuild");

    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "cv-frontend-build-"));
    try {
      const src = path.join(rootDir, "src", "frontend");
      fs.mkdirSync(path.join(src, "app"), { recursive: true });
      fs.writeFileSync(
        path.join(src, "index.html"),
        '<html><body>\n<script src="auth-client.js?v=1"></script>\n' +
          '<script type="text/babel" src="app/app.jsx"></script>\n</body></html>\n'
      );
      fs.writeFileSync(
        path.join(src, "app", "app.jsx"),
        "(() => { window.App = () => <div>ok</div>; })();\n"
      );
      fs.writeFileSync(path.join(src, "auth-client.js"), "window.AUTH = 1;\n");
      fs.writeFileSync(path.join(src, "capacitor-bridge.js"), "window.Cap = {};\n");

      const result = buildFrontend({
        esbuild,
        rootDir,
        appFileOrder: ["app.jsx"],
        envGlobalName: "__CV_ENV",
        configVars: [{ key: "SUPABASE_URL", env: "NEXT_PUBLIC_SUPABASE_URL" }],
        env: { NEXT_PUBLIC_SUPABASE_URL: "https://sb.example" },
        log: () => {},
        warn: () => {},
      });

      expect(result.bundleFile).toMatch(/^bundle\.[0-9a-f]{10}\.js$/);
      expect(fs.existsSync(path.join(result.dest, "app", result.bundleFile))).toBe(true);
      const html = fs.readFileSync(path.join(result.dest, "index.html"), "utf8");
      expect(html).not.toContain("text/babel");
      expect(fs.readFileSync(path.join(result.dest, "config.js"), "utf8")).toContain(
        '"SUPABASE_URL": "https://sb.example"'
      );
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
