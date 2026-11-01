/**
 * The links in the Contributor review emails and in-app notifications (supabase/functions/review-contributor-application)
 * must land on a screen the app really has. They once pointed at /contributor/apply and /profile, which are not routes
 * (the real ones are /apply and /dashboard/profile or /me), and the address default was a domain nobody here owns.
 *
 * The Edge Function is Deno code that cannot be imported into a test, so this reads its source, pulls out every path it
 * builds from SITE_URL and every notification `data.url`, and runs each through the app's own route table.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFrontend } from "./frontend/support/loadFrontend";

type Routes = { navFromPath: (pathname: unknown, search?: string) => { ok: boolean; legacy: boolean } };
let R: Routes;
beforeAll(() => {
  R = loadFrontend("routes.jsx").CC_ROUTES as Routes;
});

const FUNCTIONS = join(process.cwd(), "..", "..", "supabase", "functions");
const read = (fn: string) => readFileSync(join(FUNCTIONS, fn, "index.ts"), "utf8");
const review = read("review-contributor-application");

/** The app-relative paths the review function links to, with each ${...} placeholder replaced by a plausible value. */
function linkedPaths(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/\$\{SITE_URL\}(\/[^`"'\s<>]*)/g)) found.add(m[1] as string);
  for (const m of src.matchAll(/data:\s*\{\s*url:\s*"(\/[^"]*)"\s*\}/g)) found.add(m[1] as string);
  return [...found].map((p) => p.replace(/\$\{[^}]*\}/g, "some-slug"));
}

describe("the review function's links", () => {
  it("finds the links it is meant to check (so the checks below cannot pass on an empty list)", () => {
    const paths = linkedPaths(review);
    expect(paths).toEqual(expect.arrayContaining(["/c/some-slug", "/apply", "/dashboard/profile"]));
    expect(paths.length).toBeGreaterThanOrEqual(3);
  });

  it("only links to screens the app has, and not through a legacy alias", () => {
    for (const path of linkedPaths(review)) {
      const resolved = R.navFromPath(path, "");
      expect(resolved.ok, `${path} is not a screen of the app`).toBe(true);
      expect(resolved.legacy, `${path} is a legacy address`).toBe(false);
    }
  });

  it("knows the dead addresses are dead (negative control)", () => {
    for (const dead of ["/contributor/apply", "/profile", "/profile/contributor", "/login", "/events"]) {
      expect(R.navFromPath(dead, "").ok, dead).toBe(false);
    }
  });
});

describe("the address the emails start from", () => {
  it("defaults to the live site and never to a domain nobody here owns, in every function that builds email links", () => {
    for (const fn of ["review-contributor-application", "submit-contributor-application"]) {
      const src = read(fn);
      expect(src, fn).not.toMatch(/citizensconnect\.app/);
      expect(src, fn).toContain('?? "https://www.citizenscentral.co.za"');
    }
  });

  it("drops a trailing slash from the secret, so a pasted 'https://host/' does not give 'https://host//c/x'", () => {
    expect(review).toMatch(/\.replace\(\/\\\/\+\$\/, ""\)/);
  });
});
