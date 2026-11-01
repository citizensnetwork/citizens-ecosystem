import { describe, it, expect, vi, beforeEach } from "vitest";

// Middleware uses createServerClient from @supabase/ssr and NextResponse
// We test that it refreshes sessions and passes through correctly

const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null });

// The middleware only refreshes the session. The force re-login and bio-setup gates (which read
// force_reauth_at / bio_setup_required through the caller-row RPC) were retired on 2026-11-01, so
// the client has NO signOut, getSession, rpc or table access: a regression that brings any of them
// back fails loudly here instead of silently signing people out.
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

// Mock NextResponse — constructible (the middleware builds `new NextResponse`
// for OPTIONS preflights) with static next/redirect, and real Headers so the
// CORS assertions read actual header state.
const mockNextResponse: { cookies: { set: ReturnType<typeof vi.fn>; getAll: ReturnType<typeof vi.fn> }; headers: Headers } = {
  cookies: { set: vi.fn(), getAll: vi.fn().mockReturnValue([]) },
  headers: new Headers(),
};
const mockRedirectResponse = { redirected: true, cookies: { set: vi.fn() } }; // returned by NextResponse.redirect, which must never be called

vi.mock("next/server", () => {
  function NextResponse(this: { status: number; headers: Headers }, _body: unknown, init?: { status?: number }) {
    this.status = init?.status ?? 200;
    this.headers = new Headers();
  }
  (NextResponse as unknown as { next: unknown }).next = vi.fn(() => mockNextResponse);
  (NextResponse as unknown as { redirect: unknown }).redirect = vi.fn(() => mockRedirectResponse);
  return { NextResponse };
});

function makeRequest(pathname = "/dashboard", opts: { method?: string; origin?: string } = {}) {
  const headers = new Headers();
  if (opts.origin) headers.set("origin", opts.origin);
  return {
    method: opts.method ?? "GET",
    headers,
    cookies: {
      getAll: vi.fn().mockReturnValue([]),
      set: vi.fn(),
    },
    nextUrl: {
      pathname,
      clone: () => ({ pathname: "", searchParams: new URLSearchParams() }),
    },
  };
}

describe("middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNextResponse.headers = new Headers();
  });

  it("calls getUser to refresh the session", async () => {
    const { middleware } = await import("@/middleware");
    await middleware(makeRequest() as never);
    expect(mockGetUser).toHaveBeenCalled();
  });

  it("returns a NextResponse for public routes", async () => {
    const { middleware } = await import("@/middleware");
    const response = await middleware(makeRequest("/") as never);
    expect(response).toBe(mockNextResponse);
  });

  it("skips /api routes entirely — they authenticate themselves (Bearer or cookie)", async () => {
    const { middleware } = await import("@/middleware");
    const response = await middleware(makeRequest("/api/rsvp") as never);
    // Early pass-through: no cookie session work is done for API routes.
    expect(response).toBe(mockNextResponse);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("echoes an allow-listed origin on /api responses (CORS)", async () => {
    const { middleware } = await import("@/middleware");
    const response = (await middleware(
      makeRequest("/api/rsvp", { origin: "http://localhost:3001" }) as never,
    )) as unknown as { headers: Headers };
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3001");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("echoes the Capacitor shell origins on /api responses (CORS)", async () => {
    const { middleware } = await import("@/middleware");
    const response = (await middleware(
      makeRequest("/api/v1/events", { origin: "capacitor://localhost" }) as never,
    )) as unknown as { headers: Headers };
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("capacitor://localhost");
  });

  it("sets NO CORS headers for an unknown origin", async () => {
    const { middleware } = await import("@/middleware");
    const response = (await middleware(
      makeRequest("/api/rsvp", { origin: "https://evil.example.com" }) as never,
    )) as unknown as { headers: Headers };
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("answers /api OPTIONS preflights with 204 + CORS headers", async () => {
    const { middleware } = await import("@/middleware");
    const response = (await middleware(
      makeRequest("/api/rsvp", { method: "OPTIONS", origin: "http://localhost" }) as never,
    )) as unknown as { status: number; headers: Headers };
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("PATCH");
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("passes authenticated users through on normal page routes", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "test-user-id" } },
      error: null,
    });
    const { middleware } = await import("@/middleware");
    const response = await middleware(makeRequest("/dashboard") as never);
    expect(response).toBe(mockNextResponse);
  });

  it("makes no profile read and never redirects, whatever the session (the force re-login and bio-setup gates are retired, founder decision A, 2026-11-01)", async () => {
    const { NextResponse } = await import("next/server");
    const { middleware } = await import("@/middleware");
    for (const path of ["/", "/dashboard", "/admin/contributors", "/e/abc", "/logout", "/login", "/contributor/setup"]) {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } }, error: null });
      const response = await middleware(makeRequest(path) as never);
      expect(response, path).toBe(mockNextResponse);
    }
    // the mocked client throws on rpc/from/signOut, so reaching here also proves none was called
    expect(NextResponse.redirect).not.toHaveBeenCalled();
  });

  it("still refreshes (getUser) for a signed-out visitor and returns the page", async () => {
    const { middleware } = await import("@/middleware");
    const response = await middleware(makeRequest("/dashboard") as never);
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(response).toBe(mockNextResponse);
  });

  it("exports a config with matcher", async () => {
    const mod = await import("@/middleware");
    expect(mod.config).toBeDefined();
    expect(mod.config.matcher).toBeDefined();
    expect(mod.config.matcher.length).toBeGreaterThan(0);
  });
});
