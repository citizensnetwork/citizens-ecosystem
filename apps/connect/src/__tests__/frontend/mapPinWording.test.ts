/**
 * Tracker C21: say "on the map" only when it is true.
 *
 * A Contributor with no pin (online-only, "no fixed location", or an address that was never placed) is in Kingdom
 * Discovery but not on the map, so no screen may promise them the map. The rule lives in one place per side:
 * `hasMapPin` in src/lib/contributorFields.ts (server: emails, admin toasts) and `DATA.hasMapPin` / `DATA.listedWhere`
 * in src/frontend/app/data.jsx (browser: the apply preview and the "being reviewed" banner). The e2e specs
 * contributor-approval and admin-create-welcome drive the screens; this file pins the helper and keeps the old
 * unconditional promises from coming back.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFrontend } from "./support/loadFrontend";

type Data = { hasMapPin: (row: unknown) => boolean; listedWhere: (onMap: boolean) => string };
let D: Data;
beforeAll(() => {
  D = (loadFrontend("data.jsx", { localStorage: undefined }).DATA ?? {}) as Data;
});

const APP = join(process.cwd(), "src/frontend/app");
const read = (f: string) => readFileSync(join(APP, f), "utf8");

describe("DATA.hasMapPin (the browser's copy of the server rule)", () => {
  const pin = { noFixedLocation: false, lat: -25.7479, lng: 28.2293 };

  it("is true with both coordinates", () => {
    expect(D.hasMapPin(pin)).toBe(true);
    expect(D.hasMapPin({ lat: 0, lng: 0 })).toBe(true);
  });

  it("is false for no fixed location, even with stale coordinates", () => {
    expect(D.hasMapPin({ ...pin, noFixedLocation: true })).toBe(false);
  });

  it("is false with one coordinate, none, text, NaN, or no row at all", () => {
    expect(D.hasMapPin({ ...pin, lng: null })).toBe(false);
    expect(D.hasMapPin({ ...pin, lat: undefined })).toBe(false);
    expect(D.hasMapPin({ ...pin, lat: "-25.7" })).toBe(false);
    expect(D.hasMapPin({ ...pin, lat: NaN })).toBe(false);
    expect(D.hasMapPin({})).toBe(false);
    expect(D.hasMapPin(null)).toBe(false);
    expect(D.hasMapPin(undefined)).toBe(false);
  });
});

describe("DATA.listedWhere", () => {
  it("names the map only with a pin; Kingdom Discovery always", () => {
    expect(D.listedWhere(true)).toBe("on the map and in Kingdom Discovery");
    expect(D.listedWhere(false)).toBe("in Kingdom Discovery");
    expect(D.listedWhere(false)).not.toContain("map");
  });
});

describe("no screen promises the map unconditionally any more", () => {
  it("the admin screen's old flat promises are gone", () => {
    const admin = read("admin.jsx");
    expect(admin).not.toContain("'Approved. They are live on the map.'");
    expect(admin).not.toContain("toast('Contributor listing created — live on the map now.', 'green')");
    expect(admin).not.toContain("it goes live on the map and in Kingdom Discovery immediately");
    expect(admin).not.toContain("'This puts them on the map and in Kingdom Discovery, and emails them.')");
    expect(admin).not.toContain("back on the map and in Kingdom Discovery?");
    // the Approve step reads the application's own pin
    expect(admin).toContain("app.hasPin");
  });

  it("the applicant's screens say 'live', or ask the pin rule", () => {
    expect(read("pages.jsx")).not.toContain("It goes on the map once an admin approves it");
    expect(read("apply.jsx")).not.toContain("before it goes on the map");
    expect(read("apply.jsx")).toContain("window.DATA.hasMapPin(f)");
    const pending = read("pending-application.jsx");
    expect(pending).not.toContain("it goes on the map once approved.'");
    expect(pending).toContain("window.DATA.hasMapPin(");
  });
});
