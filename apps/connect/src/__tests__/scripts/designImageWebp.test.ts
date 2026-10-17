/**
 * The WebP crop helper (Designer build, phase 3). The encoder needs a real browser, which the unit-test job does not
 * have, so only its pure parts are pinned here; the real encode was run by hand against a Chromium screenshot and its
 * output is read back through the same reader the card validator uses (see the pull request's record).
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { DEFAULT_MAX_CHARS, DEFAULT_MAX_WIDTH, parseCrop } from "../../../scripts/design/image-webp.mjs";

describe("parseCrop", () => {
  it("reads x,y,w,h as whole numbers", () => {
    expect(parseCrop("10,20,300,150")).toEqual({ x: 10, y: 20, w: 300, h: 150 });
    expect(parseCrop(" 0, 0, 1, 1 ")).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
  it.each(["", "1,2,3", "1,2,3,4,5", "a,b,c,d", "1,2,0,4", "1,2,3,0", "-1,2,3,4", "1.5,2,3,4"])("rejects %j", (text) => {
    expect(() => parseCrop(text)).toThrow(/--crop/);
  });
});

describe("defaults", () => {
  it("match the refImage cap of designer.md section 5 (40 KB of data: string) and a phone-sized crop", () => {
    expect(DEFAULT_MAX_CHARS).toBe(40 * 1024);
    expect(DEFAULT_MAX_WIDTH).toBe(480);
  });
});

describe("the command line", () => {
  it("prints its usage and exits 2 when the image or --out is missing", () => {
    const script = join(__dirname, "..", "..", "..", "scripts", "design", "image-webp.mjs");
    const r = spawnSync(process.execPath, [script, "picture.png"], { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage:");
  }, 30_000);
});
