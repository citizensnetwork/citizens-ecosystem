/**
 * Map v2 strings (tracker P1-10): every piece of NEW user-visible text lives in
 * `src/frontend/app/map-v2-strings.jsx`, in South African English, in short
 * labels. D7 (English only for now) keeps translation as a copy of that one
 * object, which only works if no component carries a string of its own.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFrontend } from "./support/loadFrontend";

const APP = join(process.cwd(), "src/frontend/app");
let S: Record<string, unknown>;

beforeAll(() => {
  S = loadFrontend("map-v2-strings.jsx").MapV2Strings as Record<string, unknown>;
});

/** Every string the file can produce: literals as they are, templates called with sample arguments. */
function collect(node: unknown, path: string, out: { path: string; text: string }[]) {
  if (typeof node === "string") out.push({ path, text: node });
  else if (typeof node === "function") out.push({ path, text: String((node as (...a: unknown[]) => unknown)("Sample name", "09:00", 3)) });
  else if (Array.isArray(node)) node.forEach((v, i) => collect(v, `${path}[${i}]`, out));
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) collect(v, path ? `${path}.${k}` : k, out);
}

describe("the strings file", () => {
  it("has the pin, sheet, time and look groups, and no empty string", () => {
    expect(Object.keys(S).sort()).toEqual(["look", "pin", "sheet", "time"]);
    const all: { path: string; text: string }[] = [];
    collect(S, "", all);
    expect(all.length).toBeGreaterThan(60);
    for (const s of all) expect(s.text.trim().length, s.path).toBeGreaterThan(0);
  });

  it("uses South African spelling (colour, organisation, centre), not American", () => {
    const all: { path: string; text: string }[] = [];
    collect(S, "", all);
    for (const s of all) expect(s.text, s.path).not.toMatch(/\b(color|colors|center|organization|neighbor|favorite)\b/i);
    // the "Organisation" label specifically
    expect((S.pin as { kind: Record<string, string> }).kind.organization).toBe("Organisation");
  });

  it("keeps every label to 12 words or fewer, in sentence case", () => {
    const all: { path: string; text: string }[] = [];
    collect(S, "", all);
    for (const s of all) {
      expect(s.text.trim().split(/\s+/).length, `${s.path}: ${s.text}`).toBeLessThanOrEqual(12);
      // sentence case: after the first word no capitalised word, except proper names the sample argument supplies
      const rest = s.text.replace(/Sample name|View Full Profile/g, "").split(/\s+/).slice(1).join(" ");
      expect(rest, `${s.path}: ${s.text}`).not.toMatch(/\b[A-Z][a-z]+\b(?<!\bMon|\bTue|\bWed|\bThu|\bFri|\bSat|\bSun)/);
    }
  });
});

describe("no component carries a string of its own", () => {
  // A string literal that starts with a capital letter, has a space and lower-case letters reads like
  // user-visible text. Icon names (Navigation, Share2, ChevronUp) have no space, so they pass.
  const looksLikeText = (lit: string) => /^[A-Z][^\n]*\s[^\n]*[a-z]/.test(lit);
  for (const file of ["map-v2-sheet.jsx", "map-v2-gallery.jsx", "map-v2-pins.jsx", "map-v2-time.jsx"]) {
    it(`${file} has no hard-coded label`, () => {
      const src = readFileSync(join(APP, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      const lits = [...src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1] ?? m[2]);
      const text = lits.filter(looksLikeText);
      expect(text).toEqual([]);
    });
  }
});
