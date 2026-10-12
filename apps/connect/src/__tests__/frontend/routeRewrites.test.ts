/**
 * C15: the server must serve index.html for exactly the paths routes.jsx owns,
 * and nothing else. If next.config.ts's list drifts from the route table a deep
 * link 404s; if it ever becomes a catch-all it shadows /api, /auth and the static
 * files. This keeps the two in lockstep.
 */
import { describe, it, expect, beforeAll } from "vitest";
import nextConfig from "../../../next.config";
import { loadFrontend } from "./support/loadFrontend";

type Nav = { page: string; params: Record<string, unknown> };
type Routes = { pathFor: (nav: Nav) => string | null; PREFIXES: string[] };
type Rewrite = { source: string; destination: string };

let R: Routes;
let rewrites: Rewrite[];

const escapeRegExp = (literal: string) => literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Does a Next.js `source` pattern (`/e/:id`) match this concrete path? One segment per `:param`. */
const matches = (source: string, path: string) =>
  new RegExp("^" + source.split(/:[A-Za-z]+/).map(escapeRegExp).join("[^/]+") + "$").test(path);

beforeAll(async () => {
  R = loadFrontend("routes.jsx").CC_ROUTES as Routes;
  rewrites = (await nextConfig.rewrites!()) as Rewrite[];
});

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("next.config.ts rewrites ↔ routes.jsx", () => {
  it("serves the same index.html for every route, and for nothing else", () => {
    expect(rewrites.length).toBeGreaterThan(10);
    for (const r of rewrites) expect(r.destination, r.source).toBe("/index.html");
  });

  it("covers every path the route table can produce", () => {
    const navs: Nav[] = [
      { page: "home", params: {} },
      { page: "kingdom-discovery", params: {} },
      { page: "community", params: {} },
      { page: "messages", params: {} },
      { page: "messages", params: { convId: ID } },
      { page: "notifications", params: {} },
      { page: "settings", params: {} },
      { page: "apply", params: {} },
      { page: "onboarding", params: {} },
      { page: "dashboard", params: {} },
      { page: "dashboard", params: { tab: "events" } },
      { page: "admin", params: {} },
      { page: "admin", params: { tab: "listings" } },
      { page: "event", params: { id: ID } },
      { page: "place", params: { id: ID } },
      { page: "profile", params: { slug: "impact-radio" } },
      { page: "profile", params: { id: ID } },
      { page: "profile", params: {} },
    ];
    for (const n of navs) {
      const path = R.pathFor(n)!;
      expect(
        rewrites.some((r) => matches(r.source, path)),
        `${path} has no rewrite`,
      ).toBe(true);
    }
    // the legacy alias too
    expect(rewrites.some((r) => matches(r.source, "/map"))).toBe(true);
  });

  it("owns exactly the first path segments routes.jsx declares", () => {
    const first = new Set(rewrites.filter((r) => r.source !== "/").map((r) => r.source.split("/")[1]));
    expect([...first].sort()).toEqual([...R.PREFIXES].sort());
  });

  it("is never a catch-all and never touches the API, auth or static files", () => {
    for (const r of rewrites) {
      expect(r.source, r.source).not.toMatch(/\*|\(|\.\./);
      expect(r.source, r.source).not.toMatch(/^\/(api|auth|_next|vendor|app|assets|icons|index\.html|sw\.js|manifest\.json|config\.js)(\/|$)/);
    }
    for (const p of ["/api/v1/events", "/auth/callback", "/_next/static/x.js", "/vendor/maplibre-gl/maplibre-gl.mjs", "/app/store.jsx", "/index.html", "/sw.js", "/foo", "/dashboard/a/b"]) {
      expect(
        rewrites.some((r) => matches(r.source, p)),
        `${p} must NOT be rewritten`,
      ).toBe(false);
    }
  });

  it("no longer redirects / or /c/<slug> to /index.html?c= (they are rewrites now, so the path stays in the bar)", () => {
    expect(nextConfig.redirects).toBeUndefined();
  });
});
