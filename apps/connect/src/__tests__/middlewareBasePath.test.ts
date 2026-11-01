// @vitest-environment node
/**
 * The middleware when Connect is served under /citizens/connect (NEXT_PUBLIC_BASE_PATH, C39 PR B).
 *
 * Next strips the base path from `request.nextUrl.pathname` before the middleware runs, so the
 * code's own checks (`startsWith("/api")`, BIO_SETUP_ALLOW) keep seeing app-relative paths. The other
 * middleware test fakes the request; this one uses the REAL NextRequest/NextResponse with
 * `nextConfig.basePath`, so the premise itself is pinned, and the redirects it issues keep the prefix
 * (NextURL puts it back when serialising).
 *
 * Every redirect the middleware issues lands on the app root, the one page that exists (Connect has no
 * /login and no /contributor/setup); the last block pins that against next.config.ts's own list of served paths.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import nextConfig from "../../next.config";

const mockGetUser = vi.fn();
const mockGetSession = vi.fn();
const mockSignOut = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser, getSession: mockGetSession, signOut: mockSignOut },
    from: () => {
      throw new Error("middleware must not read public.profiles directly");
    },
    rpc: () => ({ select: () => ({ maybeSingle: mockMaybeSingle }) }),
  })),
}));

const BASE = "/citizens/connect";
const SITE = "https://site.example";

function req(path: string, opts: { base?: string; method?: string; origin?: string } = {}) {
  const base = opts.base ?? BASE;
  return new NextRequest(`${SITE}${base}${path}`, {
    method: opts.method ?? "GET",
    headers: opts.origin ? { origin: opts.origin } : {},
    nextConfig: base ? { basePath: base } : undefined,
  });
}

const contributorNeedingSetup = {
  data: { force_reauth_at: null, bio_setup_required: true, role: "contributor" },
  error: null,
};

beforeEach(() => {
  // reset (not just clear): a queued mockResolvedValueOnce a test never consumed must not leak into the next one
  for (const m of [mockGetUser, mockGetSession, mockSignOut, mockMaybeSingle]) m.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  mockSignOut.mockResolvedValue({ error: null });
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
});

describe("the premise: Next hands the middleware an app-relative path", () => {
  it("strips the base path from nextUrl.pathname and keeps it on nextUrl.basePath", () => {
    const r = req("/api/rsvp");
    expect(r.nextUrl.pathname).toBe("/api/rsvp");
    expect(r.nextUrl.basePath).toBe(BASE);
  });

  it("leaves the path alone when there is no base path (today's production)", () => {
    const r = req("/api/rsvp", { base: "" });
    expect(r.nextUrl.pathname).toBe("/api/rsvp");
    expect(r.nextUrl.basePath).toBe("");
  });
});

describe("/api under the prefix", () => {
  it("skips the cookie session work, exactly as it does at the root", async () => {
    const { middleware } = await import("@/middleware");
    const res = await middleware(req("/api/v1/events"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("echoes an allow-listed origin (CORS) and answers a preflight with 204", async () => {
    const { middleware } = await import("@/middleware");
    const res = await middleware(req("/api/rsvp", { origin: "capacitor://localhost" }));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("capacitor://localhost");

    const pre = await middleware(req("/api/rsvp", { method: "OPTIONS", origin: "https://localhost" }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("Access-Control-Allow-Origin")).toBe("https://localhost");
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("sets no CORS headers for an unknown origin", async () => {
    const { middleware } = await import("@/middleware");
    const res = await middleware(req("/api/rsvp", { origin: "https://evil.example" }));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("the bio-setup gate under the prefix (BIO_SETUP_ALLOW is app-relative)", () => {
  it("lets a contributor who still has setup to do reach the app root (the redirect target, so no loop)", async () => {
    const { middleware } = await import("@/middleware");
    for (const [path, base] of [["/", BASE], ["", BASE], ["/", ""]] as const) {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
      mockMaybeSingle.mockResolvedValueOnce(contributorNeedingSetup);
      const res = await middleware(req(path, { base }));
      expect(res.headers.get("location"), `${base}${path}`).toBeNull();
      expect(res.headers.get("x-middleware-next"), `${base}${path}`).toBe("1");
    }
  });

  it("lets them reach the other allow-listed paths, and nothing that only shares a prefix", async () => {
    const { middleware } = await import("@/middleware");
    // /login and /contributor/setup used to be allowed because they were the redirect targets; they are not pages any more.
    for (const [path, allowed] of [
      ["/logout", true],
      ["/login", false],
      ["/contributor/setup", false],
      ["/contributor/setupx", false],
      ["//dashboard", false],
    ] as const) {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
      mockMaybeSingle.mockResolvedValueOnce(contributorNeedingSetup);
      const res = await middleware(req(path));
      expect(res.headers.get("location") === null, path).toBe(allowed);
    }
  });

  it("sends them to the app root from anywhere else, and the redirect keeps the prefix", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
    mockMaybeSingle.mockResolvedValueOnce(contributorNeedingSetup);
    const { middleware } = await import("@/middleware");
    const res = await middleware(req("/dashboard"));
    expect(res.status).toBe(307);
    // Under a prefix Next writes the app root as the bare prefix (the app's front door), not with a trailing slash.
    expect(res.headers.get("location")).toBe(`${SITE}${BASE}`);
  });

  it("without a prefix the same redirect has none", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
    mockMaybeSingle.mockResolvedValueOnce(contributorNeedingSetup);
    const { middleware } = await import("@/middleware");
    const res = await middleware(req("/dashboard", { base: "" }));
    expect(res.headers.get("location")).toBe(`${SITE}/`);
  });
});

describe("the force-reauth redirect under the prefix", () => {
  it("signs out and sends the person to the app root with reauth=1, inside the prefix", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { middleware } = await import("@/middleware");
    const res = await middleware(req("/dashboard"));
    warn.mockRestore();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(res.headers.get("location")).toBe(`${SITE}${BASE}?reauth=1`);
  });
});

describe("every redirect lands on a page the app serves", () => {
  // next.config.ts's rewrites are the list of paths that return the app (index.html); a path outside it is Next's 404.
  const escapeRegExp = (literal: string) => literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = (source: string, path: string) =>
    new RegExp("^" + source.split(/:[A-Za-z]+/).map(escapeRegExp).join("[^/]+") + "$").test(path);
  const served = async (path: string) =>
    ((await nextConfig.rewrites!()) as { source: string }[]).some((r) => matches(r.source, path));

  it("knows which paths are served: the root and the screens are, the old /login and /contributor/setup are not", async () => {
    expect(await served("/")).toBe(true);
    expect(await served("/dashboard")).toBe(true);
    expect(await served("/login")).toBe(false);
    expect(await served("/contributor/setup")).toBe(false);
    expect(await served("/events")).toBe(false);
  });

  const target = (res: Response, base: string) => {
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.origin).toBe(SITE);
    expect(loc.pathname === base || loc.pathname.startsWith(`${base}/`), `${loc.pathname} stays inside ${base || "the site"}`).toBe(true);
    return loc.pathname.slice(base.length) || "/"; // the bare prefix is the app root
  };

  for (const base of [BASE, ""]) {
    it(`profile-lookup failure, stale session and bio-setup all end on a served page (prefix "${base}")`, async () => {
      const { middleware } = await import("@/middleware");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const paths: string[] = [];

      // 1. the profile cannot be read: fail closed
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
      paths.push(target(await middleware(req("/dashboard/events", { base })), base));

      // 2. the token predates force_reauth_at
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
      mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
      mockMaybeSingle.mockResolvedValueOnce({
        data: { force_reauth_at: new Date().toISOString(), bio_setup_required: false, role: "citizen" },
        error: null,
      });
      paths.push(target(await middleware(req("/e/abc", { base })), base));

      // 3. a new contributor who has not finished setup
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
      mockMaybeSingle.mockResolvedValueOnce(contributorNeedingSetup);
      paths.push(target(await middleware(req("/admin/contributors", { base })), base));
      warn.mockRestore();

      expect(paths).toEqual(["/", "/", "/"]);
      for (const path of paths) expect(await served(path), path).toBe(true);
    });
  }
});
