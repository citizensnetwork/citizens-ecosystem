// @vitest-environment node
/**
 * The middleware when Connect is served under /citizens/connect (NEXT_PUBLIC_BASE_PATH, C39 PR B).
 *
 * Next strips the base path from `request.nextUrl.pathname` before the middleware runs, so the
 * code's own checks (`startsWith("/api")`, BIO_SETUP_ALLOW) keep seeing app-relative paths. The other
 * middleware test fakes the request; this one uses the REAL NextRequest/NextResponse with
 * `nextConfig.basePath`, so the premise itself is pinned, and the redirects it issues keep the prefix
 * (NextURL puts it back when serialising).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
  it("lets a contributor who still has setup to do reach /contributor/setup", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
    mockMaybeSingle.mockResolvedValueOnce(contributorNeedingSetup);
    const { middleware } = await import("@/middleware");
    const res = await middleware(req("/contributor/setup"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets them reach the other allow-listed paths, and nothing that only shares a prefix", async () => {
    const { middleware } = await import("@/middleware");
    for (const [path, allowed] of [["/logout", true], ["/login", true], ["/auth/callback", true], ["/contributor/setupx", false]] as const) {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
      mockMaybeSingle.mockResolvedValueOnce(contributorNeedingSetup);
      const res = await middleware(req(path));
      expect(res.headers.get("location") === null, path).toBe(allowed);
    }
  });

  it("sends them to /contributor/setup from anywhere else, and the redirect keeps the prefix", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
    mockMaybeSingle.mockResolvedValueOnce(contributorNeedingSetup);
    const { middleware } = await import("@/middleware");
    const res = await middleware(req("/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${SITE}${BASE}/contributor/setup`);
  });

  it("without a prefix the same redirect has none", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
    mockMaybeSingle.mockResolvedValueOnce(contributorNeedingSetup);
    const { middleware } = await import("@/middleware");
    const res = await middleware(req("/dashboard", { base: "" }));
    expect(res.headers.get("location")).toBe(`${SITE}/contributor/setup`);
  });
});

describe("the force-reauth redirect under the prefix", () => {
  it("signs out and sends the person to /login?reauth=1 inside the prefix", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { middleware } = await import("@/middleware");
    const res = await middleware(req("/dashboard"));
    warn.mockRestore();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(res.headers.get("location")).toBe(`${SITE}${BASE}/login?reauth=1`);
  });
});
