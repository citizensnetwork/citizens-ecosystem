import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { GET, POST, DELETE } = await import(
  "@/app/api/orgs/[orgId]/departments/route"
);

const ORG_ID = "550e8400-e29b-41d4-a716-446655440000";

function makeParams(orgId: string) {
  return { params: Promise.resolve({ orgId }) };
}

describe("GET /api/orgs/[orgId]/departments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
    });

    const req = new NextRequest(
      new URL(`http://localhost/api/orgs/${ORG_ID}/departments`)
    );
    const res = await GET(req, makeParams(ORG_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid org ID", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = new NextRequest(
      new URL("http://localhost/api/orgs/bad-id/departments")
    );
    const res = await GET(req, makeParams("bad-id"));
    expect(res.status).toBe(400);
  });

  it("returns departments list", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          { id: "dept-1", name: "Engineering", org_id: ORG_ID },
          { id: "dept-2", name: "Operations", org_id: ORG_ID },
        ],
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const req = new NextRequest(
      new URL(`http://localhost/api/orgs/${ORG_ID}/departments`)
    );
    const res = await GET(req, makeParams(ORG_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
  });
});

describe("POST /api/orgs/[orgId]/departments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for missing name", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = new NextRequest(
      new URL(`http://localhost/api/orgs/${ORG_ID}/departments`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    const res = await POST(req, makeParams(ORG_ID));
    expect(res.status).toBe(400);
  });

  it("creates department on valid input", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "dept-new", name: "Finance", org_id: ORG_ID },
        error: null,
      }),
    };
    mockSupabase.from.mockReturnValue(chain);

    const req = new NextRequest(
      new URL(`http://localhost/api/orgs/${ORG_ID}/departments`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Finance" }),
      }
    );
    const res = await POST(req, makeParams(ORG_ID));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.name).toBe("Finance");
  });

  it("rejects department name too short", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = new NextRequest(
      new URL(`http://localhost/api/orgs/${ORG_ID}/departments`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "A" }),
      }
    );
    const res = await POST(req, makeParams(ORG_ID));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/orgs/[orgId]/departments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for missing department id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const req = new NextRequest(
      new URL(`http://localhost/api/orgs/${ORG_ID}/departments`),
      { method: "DELETE" }
    );
    const res = await DELETE(req, makeParams(ORG_ID));
    expect(res.status).toBe(400);
  });

  it("deletes department on valid id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const chain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    // Chain: .delete().eq('id', ...).eq('org_id', ...)
    chain.eq.mockReturnValueOnce(chain).mockResolvedValueOnce({ error: null });
    mockSupabase.from.mockReturnValue(chain);

    const deptId = "550e8400-e29b-41d4-a716-446655440001";
    const req = new NextRequest(
      new URL(
        `http://localhost/api/orgs/${ORG_ID}/departments?id=${deptId}`
      ),
      { method: "DELETE" }
    );
    const res = await DELETE(req, makeParams(ORG_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
