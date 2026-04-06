import { describe, it, expect, vi, beforeEach } from "vitest";

// Middleware uses createServerClient from @supabase/ssr and NextResponse
// We test that it refreshes sessions and passes through correctly

const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null } });

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

// Mock NextResponse
const mockNextResponse = {
  cookies: { set: vi.fn() },
};

vi.mock("next/server", () => ({
  NextResponse: {
    next: vi.fn(() => mockNextResponse),
  },
}));

describe("middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls getUser to refresh the session", async () => {
    const { middleware } = await import("@/middleware");

    const request = {
      cookies: {
        getAll: vi.fn().mockReturnValue([]),
        set: vi.fn(),
      },
    };

    await middleware(request as never);

    expect(mockGetUser).toHaveBeenCalled();
  });

  it("returns a NextResponse", async () => {
    const { middleware } = await import("@/middleware");

    const request = {
      cookies: {
        getAll: vi.fn().mockReturnValue([]),
        set: vi.fn(),
      },
    };

    const response = await middleware(request as never);
    expect(response).toBe(mockNextResponse);
  });

  it("exports a config with matcher", async () => {
    const mod = await import("@/middleware");
    expect(mod.config).toBeDefined();
    expect(mod.config.matcher).toBeDefined();
    expect(mod.config.matcher.length).toBeGreaterThan(0);
  });
});
