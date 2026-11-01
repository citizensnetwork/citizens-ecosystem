// @vitest-environment node
/**
 * The middleware when Connect is served under /citizens/connect (NEXT_PUBLIC_BASE_PATH, C39 PR B).
 *
 * Next strips the base path from `request.nextUrl.pathname` before the middleware runs, so the
 * code's own check (`startsWith("/api")`) keeps seeing app-relative paths. The other middleware test
 * fakes the request; this one uses the REAL NextRequest/NextResponse with `nextConfig.basePath`, so
 * the premise itself is pinned. The middleware no longer redirects anyone (the force re-login and
 * bio-setup gates were retired, founder decision A of 2026-11-01), so a page request under the prefix
 * just refreshes the session and passes through.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();

// Only getUser exists: a profile read, a table read or a sign-out would throw and fail the test.
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: () => {
      throw new Error("middleware must not read public.profiles directly");
    },
    rpc: () => {
      throw new Error("middleware must not read the caller's private profile any more");
    },
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

beforeEach(() => {
  // reset (not just clear): a queued mockResolvedValueOnce a test never consumed must not leak into the next one
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
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

describe("page routes under the prefix", () => {
  it("refreshes the session and passes the request through with no redirect, signed in or not, with or without the prefix", async () => {
    const { middleware } = await import("@/middleware");
    let calls = 0;
    for (const [path, base] of [["/dashboard", BASE], ["/", BASE], ["", BASE], ["/dashboard", ""]] as const) {
      for (const user of [null, { id: "u1" }]) {
        mockGetUser.mockResolvedValueOnce({ data: { user }, error: null });
        const res = await middleware(req(path, { base }));
        calls += 1;
        expect(res.headers.get("location"), `${base}${path}`).toBeNull();
        expect(res.headers.get("x-middleware-next"), `${base}${path}`).toBe("1");
      }
    }
    expect(mockGetUser).toHaveBeenCalledTimes(calls);
  });
});
