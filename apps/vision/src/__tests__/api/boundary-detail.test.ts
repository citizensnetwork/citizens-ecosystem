import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const mod = await import("@/app/api/boundaries/[id]/route");
const { GET, PATCH, DELETE: DEL } = mod;

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const BOUNDARY_ID = "660e8400-e29b-41d4-a716-446655440000";

function createRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>
) {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, "http://localhost"), init as never);
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/boundaries/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for invalid UUID", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await GET(
      createRequest("GET", `http://localhost/api/boundaries/not-a-uuid`),
      makeParams("not-a-uuid")
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 for unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(
      createRequest("GET", `http://localhost/api/boundaries/${BOUNDARY_ID}`),
      makeParams(BOUNDARY_ID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent boundary", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const res = await GET(
      createRequest("GET", `http://localhost/api/boundaries/${BOUNDARY_ID}`),
      makeParams(BOUNDARY_ID)
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-members", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const boundaryChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: BOUNDARY_ID, org_id: VALID_UUID, name: "Area" }, error: null }),
    };
    const memberChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    };
    mockSupabase.from
      .mockReturnValueOnce(boundaryChain)
      .mockReturnValueOnce(memberChain);

    const res = await GET(
      createRequest("GET", `http://localhost/api/boundaries/${BOUNDARY_ID}`),
      makeParams(BOUNDARY_ID)
    );
    expect(res.status).toBe(403);
  });

  it("returns boundary for member (200)", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const boundaryData = { id: BOUNDARY_ID, org_id: VALID_UUID, name: "My Area" };
    const boundaryChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: boundaryData, error: null }),
    };
    const memberChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "org_member" } }),
    };
    mockSupabase.from
      .mockReturnValueOnce(boundaryChain)
      .mockReturnValueOnce(memberChain);

    const res = await GET(
      createRequest("GET", `http://localhost/api/boundaries/${BOUNDARY_ID}`),
      makeParams(BOUNDARY_ID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("My Area");
  });
});

describe("PATCH /api/boundaries/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for invalid UUID", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const res = await PATCH(
      createRequest("PATCH", `http://localhost/api/boundaries/bad`, {
        name: "Updated",
      }),
      makeParams("bad")
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 for unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(
      createRequest("PATCH", `http://localhost/api/boundaries/${BOUNDARY_ID}`, {
        name: "Updated",
      }),
      makeParams(BOUNDARY_ID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin/manager", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const boundaryChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { org_id: VALID_UUID } }),
    };
    const memberChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "org_member" } }),
    };
    mockSupabase.from
      .mockReturnValueOnce(boundaryChain)
      .mockReturnValueOnce(memberChain);

    const res = await PATCH(
      createRequest("PATCH", `http://localhost/api/boundaries/${BOUNDARY_ID}`, {
        name: "Updated",
      }),
      makeParams(BOUNDARY_ID)
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for empty update body", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const boundaryChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { org_id: VALID_UUID } }),
    };
    const memberChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "org_admin" } }),
    };
    mockSupabase.from
      .mockReturnValueOnce(boundaryChain)
      .mockReturnValueOnce(memberChain);

    const res = await PATCH(
      createRequest("PATCH", `http://localhost/api/boundaries/${BOUNDARY_ID}`, {}),
      makeParams(BOUNDARY_ID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("No valid fields");
  });

  it("returns 400 for blank name", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const boundaryChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { org_id: VALID_UUID } }),
    };
    const memberChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "org_admin" } }),
    };
    mockSupabase.from
      .mockReturnValueOnce(boundaryChain)
      .mockReturnValueOnce(memberChain);

    const res = await PATCH(
      createRequest("PATCH", `http://localhost/api/boundaries/${BOUNDARY_ID}`, {
        name: "   ",
      }),
      makeParams(BOUNDARY_ID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("non-empty string");
  });

  it("returns 200 for valid update", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const boundaryChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { org_id: VALID_UUID } }),
    };
    const memberChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "org_admin" } }),
    };
    const updatedData = { id: BOUNDARY_ID, name: "Renamed Area" };
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updatedData, error: null }),
    };
    mockSupabase.from
      .mockReturnValueOnce(boundaryChain)
      .mockReturnValueOnce(memberChain)
      .mockReturnValueOnce(updateChain);

    const res = await PATCH(
      createRequest("PATCH", `http://localhost/api/boundaries/${BOUNDARY_ID}`, {
        name: "Renamed Area",
      }),
      makeParams(BOUNDARY_ID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Renamed Area");
  });
});

describe("DELETE /api/boundaries/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await DEL(
      createRequest("DELETE", `http://localhost/api/boundaries/${BOUNDARY_ID}`),
      makeParams(BOUNDARY_ID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent boundary", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const res = await DEL(
      createRequest("DELETE", `http://localhost/api/boundaries/${BOUNDARY_ID}`),
      makeParams(BOUNDARY_ID)
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-admin", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const boundaryChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { org_id: VALID_UUID } }),
    };
    const memberChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "org_manager" } }),
    };
    mockSupabase.from
      .mockReturnValueOnce(boundaryChain)
      .mockReturnValueOnce(memberChain);

    const res = await DEL(
      createRequest("DELETE", `http://localhost/api/boundaries/${BOUNDARY_ID}`),
      makeParams(BOUNDARY_ID)
    );
    expect(res.status).toBe(403);
  });

  it("succeeds for admin", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    });
    const boundaryChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { org_id: VALID_UUID } }),
    };
    const memberChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: "org_admin" } }),
    };
    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mockSupabase.from
      .mockReturnValueOnce(boundaryChain)
      .mockReturnValueOnce(memberChain)
      .mockReturnValueOnce(deleteChain);

    const res = await DEL(
      createRequest("DELETE", `http://localhost/api/boundaries/${BOUNDARY_ID}`),
      makeParams(BOUNDARY_ID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });
});
