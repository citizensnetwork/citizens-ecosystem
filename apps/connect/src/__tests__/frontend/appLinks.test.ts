/**
 * App links (QA fix plan PR G; QA row CC-08 "share into the same listing, sign-in return"). An https link to a
 * Connect screen opens the native app once Android verifies the App Link; Capacitor hands it to the app as
 * `appUrlOpen` (app running) or App.getLaunchUrl() (the link started the app). One pure function,
 * CC_ROUTES.routeFromAppLink (routes.jsx), decides which screen a link names; store.jsx opens it with go().
 *
 * The release key's assetlinks.json is not here yet (no Android release key, founder 2026-11-25): until the file is
 * served on the 219.co.za front door, Android opens these links in the browser, and the code below simply waits.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFrontend } from "./support/loadFrontend";

type Nav = { page: string; params: Record<string, unknown> };
type Resolved = { ok: boolean; nav: Nav; canonical: string; legacy: boolean };
type Routes = { routeFromAppLink: (url: unknown) => Resolved | null };

const load = (env?: Record<string, string>) =>
  loadFrontend("routes.jsx", env ? { __CC_ENV: env } : {}).CC_ROUTES as Routes;
const R = load();
const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ROOT = "https://219.co.za/citizens/connect";

describe("routeFromAppLink: a link that opened the app → the screen it names", () => {
  it.each([
    [`${ROOT}/e/${UUID}`, "event", { id: UUID }],
    [`${ROOT}/p/${UUID}`, "place", { id: UUID }],
    [`${ROOT}/c/anchor-church`, "profile", { slug: "anchor-church" }],
    [`${ROOT}/explore`, "explore", {}],
    [`${ROOT}/discover`, "explore", {}], // the retired Kingdom Exploration address opens Explore
    [`${ROOT}/dashboard/events`, "dashboard", { tab: "events" }],
    [`${ROOT}`, "home", {}],
    [`${ROOT}/`, "home", {}],
  ])("%s → %s", (url, page, params) => {
    const r = R.routeFromAppLink(url);
    expect(r?.nav.page).toBe(page);
    expect(r?.nav.params).toMatchObject(params);
  });

  it("keeps the query a screen reads (the old ?c= shell link)", () => {
    expect(R.routeFromAppLink(`${ROOT}/index.html?c=anchor-church`)?.nav).toEqual({
      page: "profile",
      params: { slug: "anchor-church" },
    });
  });

  it.each([
    ["another host", `https://evil.example/citizens/connect/e/${UUID}`],
    ["a lookalike host", `https://219.co.za.evil.example/citizens/connect/e/${UUID}`],
    ["plain http", `http://219.co.za/citizens/connect/e/${UUID}`],
    ["a port", `https://219.co.za:8443/citizens/connect/e/${UUID}`],
    ["a user name", `https://someone@219.co.za/citizens/connect/e/${UUID}`],
    ["outside the prefix", `https://219.co.za/citizens/wear/e/${UUID}`],
    ["a lookalike prefix", `https://219.co.za/citizens/connectx/e/${UUID}`],
    ["the site root", "https://219.co.za/"],
    ["a path that names no screen", `${ROOT}/nowhere/at/all`],
    ["the sign-in callback", "citizensconnect://auth-callback?code=abc"],
    ["javascript:", "javascript:alert(1)"],
    ["not a URL", "not a url"],
    ["an empty string", ""],
    ["a very long link", `${ROOT}/c/${"a".repeat(3000)}`],
  ])("ignores %s", (_label, url) => {
    expect(R.routeFromAppLink(url)).toBeNull();
  });

  it.each([[undefined], [null], [42], [{}]])("ignores %j", (v) => {
    expect(R.routeFromAppLink(v)).toBeNull();
  });

  it("also opens a link to the build's own public address (a link the app shared)", () => {
    const own = load({ PUBLIC_ORIGIN: "https://connect.example", PUBLIC_BASE_PATH: "" });
    expect(own.routeFromAppLink(`https://connect.example/e/${UUID}`)?.nav.page).toBe("event");
    expect(own.routeFromAppLink(`${ROOT}/e/${UUID}`)?.nav.page).toBe("event");
  });
});

describe("the code and the native shell agree", () => {
  const manifest = readFileSync(join(process.cwd(), "android/app/src/main/AndroidManifest.xml"), "utf8");
  const store = readFileSync(join(process.cwd(), "src/frontend/app/store.jsx"), "utf8");

  it("routes exactly the https host and prefix Android verifies (the autoVerify intent filter)", () => {
    const filter = /<intent-filter android:autoVerify="true">([\s\S]*?)<\/intent-filter>/.exec(manifest)?.[1] ?? "";
    const data = /<data android:scheme="([^"]+)" android:host="([^"]+)" android:pathPrefix="([^"]+)"/.exec(filter);
    expect(data?.slice(1)).toEqual(["https", "219.co.za", "/citizens/connect"]);
    expect(R.routeFromAppLink(`${data![1]}://${data![2]}${data![3]}/explore`)?.nav.page).toBe("explore");
  });

  it("store.jsx routes both the running app's links and the launch link through routeFromAppLink", () => {
    expect(store).toContain("addListener('appUrlOpen'");
    expect(store).toContain("window.CapApp.getLaunchUrl()");
    expect(store).toMatch(/ROUTES\.routeFromAppLink\(url\)/);
  });
});
