import { describe, it, expect, vi, beforeEach } from "vitest";

// Middleware uses createServerClient from @supabase/ssr and NextResponse
// We test that it refreshes sessions and passes through correctly

const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null });

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
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
});
