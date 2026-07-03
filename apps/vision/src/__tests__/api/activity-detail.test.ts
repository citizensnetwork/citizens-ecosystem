import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { GET, PATCH, DELETE } = await import(
  "@/app/api/activities/[id]/route"
);

const ACT_ID = "550e8400-e29b-41d4-a716-446655440000";

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/activities/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const req = new NextRequest(
      new URL(`http://localhost/api/activities/${ACT_ID}`)
    );
    const res = await GET(req, makeParams(ACT_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid ID", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = new NextRequest(
      new URL("http://localhost/api/activities/bad-id")
    );
    const res = await GET(req, makeParams("bad-id"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when activity not found", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116", message: "not found" },
      }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const req = new NextRequest(
      new URL(`http://localhost/api/activities/${ACT_ID}`)
    );
    const res = await GET(req, makeParams(ACT_ID));
    expect(res.status).toBe(404);
  });

  it("returns activity with tags and department", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const actData = {
      id: ACT_ID,
      title: "Workshop",
      type: "workshop",
      activity_tags: [{ tag: "education" }],
      departments: { name: "Education" },
    };

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: actData, error: null }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const req = new NextRequest(
      new URL(`http://localhost/api/activities/${ACT_ID}`)
    );
    const res = await GET(req, makeParams(ACT_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.title).toBe("Workshop");
    expect(body.data.activity_tags).toHaveLength(1);
  });
});

describe("PATCH /api/activities/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const req = new NextRequest(
      new URL(`http://localhost/api/activities/${ACT_ID}`),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated" }),
      }
    );
    const res = await PATCH(req, makeParams(ACT_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for validation failure", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = new NextRequest(
      new URL(`http://localhost/api/activities/${ACT_ID}`),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "invalid_type" }),
      }
    );
    const res = await PATCH(req, makeParams(ACT_ID));
    expect(res.status).toBe(400);
  });

  it("updates activity fields", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    // Generic chain that handles all possible Supabase method calls
    const genericChain: Record<string, ReturnType<typeof vi.fn>> = {};
    const methods = [
      "update",
      "delete",
      "insert",
      "select",
      "eq",
      "single",
    ];
    for (const m of methods) {
      genericChain[m] = vi.fn().mockReturnValue(genericChain);
    }
    // The final single() should resolve with the updated activity
    genericChain.single.mockResolvedValue({
      data: { id: ACT_ID, title: "Updated", activity_tags: [] },
      error: null,
    });
    // eq() for update resolves with no error
    genericChain.eq.mockImplementation(() => {
      return Object.assign(Promise.resolve({ error: null }), genericChain);
    });

    mockSupabase.from.mockReturnValue(genericChain);

    const req = new NextRequest(
      new URL(`http://localhost/api/activities/${ACT_ID}`),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated" }),
      }
    );
    const res = await PATCH(req, makeParams(ACT_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.title).toBe("Updated");
  });
});

describe("DELETE /api/activities/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const req = new NextRequest(
      new URL(`http://localhost/api/activities/${ACT_ID}`),
      { method: "DELETE" }
    );
    const res = await DELETE(req, makeParams(ACT_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid ID", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = new NextRequest(
      new URL("http://localhost/api/activities/bad-id"),
      { method: "DELETE" }
    );
    const res = await DELETE(req, makeParams("bad-id"));
    expect(res.status).toBe(400);
  });

  it("deletes activity successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: { org_id: "org-1" }, error: null }),
    };
    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mockSupabase.from
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(deleteChain);

    const req = new NextRequest(
      new URL(`http://localhost/api/activities/${ACT_ID}`),
      { method: "DELETE" }
    );
    const res = await DELETE(req, makeParams(ACT_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
