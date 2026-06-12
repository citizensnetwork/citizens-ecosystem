import { describe, it, expect, vi, beforeEach } from "vitest";

// Middleware uses createServerClient from @supabase/ssr and NextResponse
// We test that it refreshes sessions and passes through correctly

const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null });
const mockGetSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
const mockSignOut = vi.fn().mockResolvedValue({ error: null });
const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser, getSession: mockGetSession, signOut: mockSignOut },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    }),
  })),
}));

// Mock NextResponse — constructible (the middleware builds `new NextResponse`
// for OPTIONS preflights) with static next/redirect, and real Headers so the
// CORS assertions read actual header state.
const mockNextResponse: { cookies: { set: ReturnType<typeof vi.fn>; getAll: ReturnType<typeof vi.fn> }; headers: Headers } = {
  cookies: { set: vi.fn(), getAll: vi.fn().mockReturnValue([]) },
  headers: new Headers(),
};
const mockRedirectResponse = { redirected: true, cookies: { set: vi.fn() } };

vi.mock("next/server", () => {
  function NextResponse(this: { status: number; headers: Headers }, _body: unknown, init?: { status?: number }) {
    this.status = init?.status ?? 200;
    this.headers = new Headers();
  }
  (NextResponse as unknown as { next: unknown }).next = vi.fn(() => mockNextResponse);
  (NextResponse as unknown as { redirect: unknown }).redirect = vi.fn(() => mockRedirectResponse);
  return { NextResponse };
});

function makeRequest(pathname = "/events", opts: { method?: string; origin?: string } = {}) {
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
    const response = await middleware(makeRequest("/events") as never);
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
    const response = await middleware(makeRequest("/events") as never);
    expect(response).toBe(mockNextResponse);
  });

  it("exports a config with matcher", async () => {
    const mod = await import("@/middleware");
    expect(mod.config).toBeDefined();
    expect(mod.config.matcher).toBeDefined();
    expect(mod.config.matcher.length).toBeGreaterThan(0);
  });

  it("force-reauth gate: signs out + redirects when force_reauth_at is newer than session iat", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1" } },
      error: null,
    });
    // Build a fake JWT with iat 1000 (seconds since epoch) — the payload
    // only needs a parseable base64url middle segment.
    const payload = Buffer.from(JSON.stringify({ iat: 1000 })).toString("base64url");
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: `h.${payload}.s` } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        // 2_000_000 ms = year 1970 + ~33 minutes, far newer than iat=1000s
        force_reauth_at: new Date(2_000_000).toISOString(),
        bio_setup_required: false,
        role: "citizen",
      },
      error: null,
    });
    const { middleware } = await import("@/middleware");
    const { NextResponse } = await import("next/server");
    await middleware(makeRequest("/events") as never);
    expect(mockSignOut).toHaveBeenCalled();
    expect(NextResponse.redirect).toHaveBeenCalled();
  });

  it("bio-setup gate: redirects contributors with bio_setup_required to /contributor/setup", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u2" } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        force_reauth_at: null,
        bio_setup_required: true,
        role: "contributor",
      },
      error: null,
    });
    const { middleware } = await import("@/middleware");
    const { NextResponse } = await import("next/server");
    await middleware(makeRequest("/events") as never);
    expect(NextResponse.redirect).toHaveBeenCalled();
  });

  it("bio-setup gate: does NOT redirect when already on /contributor/setup", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u3" } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        force_reauth_at: null,
        bio_setup_required: true,
        role: "contributor",
      },
      error: null,
    });
    const { middleware } = await import("@/middleware");
    const response = await middleware(makeRequest("/contributor/setup") as never);
    expect(response).toBe(mockNextResponse);
  });

  it("force-reauth gate: fails closed when access_token cannot be parsed", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u4" } },
      error: null,
    });
    // No session returned — we cannot verify iat, so the gate must
    // fail closed and force a re-login.
    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        force_reauth_at: new Date(Date.now()).toISOString(),
        bio_setup_required: false,
        role: "citizen",
      },
      error: null,
    });
    const { middleware } = await import("@/middleware");
    const { NextResponse } = await import("next/server");
    await middleware(makeRequest("/events") as never);
    expect(mockSignOut).toHaveBeenCalled();
    expect(NextResponse.redirect).toHaveBeenCalled();
  });

  it("profile lookup error: signs out and redirects to /login?reauth=1", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u5" } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "42P01", message: "transient db error" },
    });
    const { middleware } = await import("@/middleware");
    const { NextResponse } = await import("next/server");
    await middleware(makeRequest("/events") as never);
    expect(mockSignOut).toHaveBeenCalled();
    expect(NextResponse.redirect).toHaveBeenCalled();
  });

  it("propagates cleared auth cookies onto the redirect on signOut paths", async () => {
    // Audit: middleware-and-session, Finding #1.
    // signOut() writes cleared sb-* cookies onto supabaseResponse via
    // our cookies.setAll callback. The redirect response must inherit
    // them or the browser keeps stale auth cookies and force-reauth fails.
    const supabaseCookieJar = [
      { name: "sb-access-token", value: "", maxAge: 0 },
      { name: "sb-refresh-token", value: "", maxAge: 0 },
    ];
    const redirectCookieSet = vi.fn();
    const supabaseResponseStub = {
      cookies: {
        getAll: () => supabaseCookieJar,
        set: vi.fn(),
      },
    };
    const redirectResponseStub = {
      redirected: true,
      cookies: { set: redirectCookieSet },
    };

    const { NextResponse } = await import("next/server");
    (NextResponse.next as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      supabaseResponseStub,
    );
    (NextResponse.redirect as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      redirectResponseStub,
    );

    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u6" } }, error: null });
    mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "42P01", message: "transient" },
    });

    const { middleware } = await import("@/middleware");
    await middleware(makeRequest("/events") as never);

    expect(mockSignOut).toHaveBeenCalled();
    expect(redirectCookieSet).toHaveBeenCalledTimes(supabaseCookieJar.length);
    expect(redirectCookieSet).toHaveBeenCalledWith(supabaseCookieJar[0]);
    expect(redirectCookieSet).toHaveBeenCalledWith(supabaseCookieJar[1]);
  });
});
