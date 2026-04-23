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

// Mock NextResponse
const mockNextResponse = {
  cookies: { set: vi.fn() },
};
const mockRedirectResponse = { redirected: true };

vi.mock("next/server", () => ({
  NextResponse: {
    next: vi.fn(() => mockNextResponse),
    redirect: vi.fn(() => mockRedirectResponse),
  },
}));

function makeRequest(pathname = "/events") {
  return {
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

  it("redirects unauthenticated users on protected routes", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const { middleware } = await import("@/middleware");
    const { NextResponse } = await import("next/server");

    await middleware(makeRequest("/profile") as never);
    expect(NextResponse.redirect).toHaveBeenCalled();
  });

  it("allows authenticated users on protected routes", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "test-user-id" } },
      error: null,
    });
    const { middleware } = await import("@/middleware");
    const response = await middleware(makeRequest("/profile") as never);
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
});
