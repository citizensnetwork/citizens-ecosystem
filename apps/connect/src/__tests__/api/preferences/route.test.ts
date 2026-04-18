import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST } = await import("@/app/api/preferences/route");

const USER_ID = "11111111-1111-1111-1111-111111111111";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/preferences", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });
    // Default: existing preferences are empty.
    mockClient._chain._result.data = { preferences: {} };
    mockClient._chain._result.error = null;
  });

  it("returns 401 when user is not signed in", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const res = await POST(makeRequest({ wyr: { crowd_size: "left" } }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is not a JSON object", async () => {
    const res = await POST(makeRequest([1, 2]));
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is invalid JSON", async () => {
    const res = await POST(makeRequest("not-json"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when wyr is not an object", async () => {
    const res = await POST(makeRequest({ wyr: "left" }));
    expect(res.status).toBe(400);
  });

  it("filters out non-{left|right} wyr values", async () => {
    const res = await POST(
      makeRequest({ wyr: { crowd_size: "left", bogus: "maybe" } })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preferences.wyr).toEqual({ crowd_size: "left" });
  });

  it("deep-merges new wyr answers with existing ones", async () => {
    mockClient._chain._result.data = {
      preferences: { wyr: { planning: "right" } },
    };
    const res = await POST(makeRequest({ wyr: { crowd_size: "left" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preferences.wyr).toEqual({
      planning: "right",
      crowd_size: "left",
    });
  });

  it("forwards unknown top-level slices verbatim", async () => {
    const res = await POST(makeRequest({ theme: "dark" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preferences.theme).toBe("dark");
  });
});
