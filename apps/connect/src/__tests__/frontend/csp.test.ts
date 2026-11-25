/**
 * The strict Content-Security-Policy (QA fix plan PR F3, 2026-11-25; QA finding CCQA-0007: the CSP allowed inline
 * scripts broadly). The frontend is static HTML, so per-request nonces are impossible: the page carries no inline
 * script and no inline <style> element at all, and the policy allows scripts and stylesheets from this origin only.
 *
 * The strict policy ships as `Content-Security-Policy-Report-Only` for a week (founder, 2026-11-25), beside today's
 * enforced policy, and violations go to /api/csp-report. The enforcing PR then moves it into
 * `Content-Security-Policy`; `ENFORCED` below flips with it, and from then on this file also fails if the ENFORCED
 * policy's script-src ever allows 'unsafe-inline' again.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** True once the strict policy is the enforced one (the enforcing PR sets it). */
const ENFORCED = false;

type Header = { key: string; value: string };
type Config = { headers?: () => Promise<{ source: string; headers: Header[] }[]> };

const ENV = "NEXT_PUBLIC_BASE_PATH";
const saved = process.env[ENV];
afterEach(() => {
  if (saved === undefined) delete process.env[ENV];
  else process.env[ENV] = saved;
  vi.resetModules();
});

async function headers(basePath: string | undefined): Promise<Header[]> {
  if (basePath === undefined) delete process.env[ENV];
  else process.env[ENV] = basePath;
  vi.resetModules();
  const config = (await import("../../../next.config")).default as Config;
  return (await config.headers!())[0].headers;
}

/** A policy as { directive: [sources] }. */
function directives(policy: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) out[name] = sources;
  }
  return out;
}

const valueOf = (list: Header[], key: string) => list.find((h) => h.key === key)?.value ?? "";

describe("the strict policy", () => {
  for (const basePath of [undefined, "/citizens/connect"]) {
    const prefix = basePath ?? "";
    it(`allows scripts and stylesheets from this origin only, with no 'unsafe-inline' or eval (base path ${JSON.stringify(basePath)})`, async () => {
      const list = await headers(basePath);
      const strict = directives(valueOf(list, ENFORCED ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only"));
      expect(strict["script-src"]).toEqual(["'self'"]);
      expect(strict["style-src-elem"]).toEqual(["'self'"]);
      // React and MapLibre set element styles: only the style ATTRIBUTE may be inline
      expect(strict["style-src-attr"]).toEqual(["'unsafe-inline'"]);
      expect(strict["object-src"]).toEqual(["'none'"]);
      expect(strict["base-uri"]).toEqual(["'self'"]);
      expect(strict["frame-ancestors"]).toEqual(["'none'"]);
      for (const name of ["script-src", "script-src-elem", "script-src-attr", "style-src-elem", "font-src"]) {
        for (const source of strict[name] ?? []) {
          expect(source, `${name} ${source}`).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|https?:|\*/);
        }
      }
      // violations are reported to our own endpoint, under the base path
      expect(strict["report-uri"]).toEqual([`${prefix}/api/csp-report`]);
      expect(strict["report-to"]).toEqual(["csp"]);
      expect(valueOf(list, "Reporting-Endpoints")).toBe(`csp="${prefix}/api/csp-report"`);
    });
  }

  it("the enforced policy never lets 'unsafe-inline' back into script-src once the strict one is enforced", async () => {
    const enforced = directives(valueOf(await headers(undefined), "Content-Security-Policy"));
    if (ENFORCED) expect(enforced["script-src"]).toEqual(["'self'"]);
    // until then it may still carry 'unsafe-inline', but never a CDN host again (PR F2)
    for (const source of enforced["script-src"] ?? []) expect(source).not.toMatch(/https?:/);
  });

  it("keeps the enforced policy's hosts for images, media and connections (the strict one only tightens scripts and styles)", async () => {
    const list = await headers(undefined);
    const enforced = directives(valueOf(list, "Content-Security-Policy"));
    const strict = directives(valueOf(list, "Content-Security-Policy-Report-Only"));
    for (const name of ["img-src", "media-src", "connect-src", "worker-src", "form-action"]) {
      expect(strict[name], name).toEqual(enforced[name]);
    }
  });
});

describe("the page itself needs no inline code", () => {
  const FRONTEND = join(process.cwd(), "src/frontend");
  const index = readFileSync(join(FRONTEND, "index.html"), "utf8");
  const page = new DOMParser().parseFromString(index, "text/html");

  it("index.html has no inline script, no <style> element and no inline event handler", () => {
    for (const script of Array.from(page.scripts)) {
      // a text/babel tag is the build's input, replaced by the hashed bundle; every other script names a file
      if (script.getAttribute("type") === "text/babel") continue;
      expect(script.getAttribute("src"), script.outerHTML.slice(0, 80)).toBeTruthy();
      expect(script.textContent?.trim()).toBe("");
    }
    expect(page.querySelectorAll("style")).toHaveLength(0);
    const handlers = Array.from(page.querySelectorAll("*")).flatMap((el) =>
      Array.from(el.attributes).filter((a) => /^on/i.test(a.name)).map((a) => `${el.tagName} ${a.name}`),
    );
    expect(handlers).toEqual([]);
    expect(index).not.toMatch(/javascript:/i);
  });

  it("no screen renders a <style> element or sets an on* attribute from a string", () => {
    const app = join(FRONTEND, "app");
    for (const file of readdirSync(app).filter((f) => f.endsWith(".jsx"))) {
      const code = readFileSync(join(app, file), "utf8");
      expect(code, file).not.toMatch(/<style[\s>]|createElement\(\s*['"]style['"]/);
      expect(code, file).not.toMatch(/setAttribute\(\s*['"]on[a-z]+['"]/);
      expect(code, file).not.toMatch(/\beval\(|new Function\(/);
    }
  });
});
