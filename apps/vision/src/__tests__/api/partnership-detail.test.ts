import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

function buildChain(data: unknown = null, error: unknown = null): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.or = () => chain;
  chain.order = () => chain;
  chain.single = () => Promise.resolve({ data, error });
  chain.update = () => chain;
  chain.delete = () => ({ eq: () => Promise.resolve({ error }) });
  return chain;
}

const { GET, PATCH, DELETE } = await import("@/app/api/partnerships/[id]/route");

const VALID_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/partnerships/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest(`http://localhost/api/partnerships/${VALID_ID}`);
    const res = await GET(req, makeContext(VALID_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid UUID", async () => {
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    const req = new NextRequest("http://localhost/api/partnerships/bad-id");
    const res = await GET(req, makeContext("bad-id"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when partnership not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    const firstChain = buildChain(null, { code: "PGRST116" });
    mockFrom.mockReturnValue(firstChain);
    const req = new NextRequest(`http://localhost/api/partnerships/${VALID_ID}`);
    const res = await GET(req, makeContext(VALID_ID));
    expect(res.status).toBe(404);
  });

  it("returns 200 with partnership and shared metrics", async () => {
    const partnership = {
      id: VALID_ID,
      status: "active",
      org_a: { id: "org-a", name: "Org A", slug: "org-a" },
      org_b: { id: "org-b", name: "Org B", slug: "org-b" },
    };
    const sharedMetrics = [{ id: "sm1", metric_slug: "total_activities", visible: true }];
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });

    // First call: org_partnerships select → returns partnership
    // Second call: shared_metrics select → returns metrics
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return buildChain(partnership);
      }
      // shared_metrics query returns array (no .single())
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => Promise.resolve({ data: sharedMetrics, error: null });
      return chain;
    });

    const req = new NextRequest(`http://localhost/api/partnerships/${VALID_ID}`);
    const res = await GET(req, makeContext(VALID_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("active");
    expect(json.shared_metrics).toHaveLength(1);
  });
});

describe("PATCH /api/partnerships/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest(`http://localhost/api/partnerships/${VALID_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    const res = await PATCH(req, makeContext(VALID_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid UUID", async () => {
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    const req = new NextRequest("http://localhost/api/partnerships/bad-id", {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    const res = await PATCH(req, makeContext("bad-id"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    const req = new NextRequest(`http://localhost/api/partnerships/${VALID_ID}`, {
      method: "PATCH",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, makeContext(VALID_ID));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid status value", async () => {
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    const req = new NextRequest(`http://localhost/api/partnerships/${VALID_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "invalid_status" }),
    });
    const res = await PATCH(req, makeContext(VALID_ID));
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful status update", async () => {
    const updated = { id: VALID_ID, status: "active", sharing_level: "aggregate" };
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    mockFrom.mockReturnValue(buildChain(updated));
    const req = new NextRequest(`http://localhost/api/partnerships/${VALID_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    const res = await PATCH(req, makeContext(VALID_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("active");
  });
});

describe("DELETE /api/partnerships/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest(`http://localhost/api/partnerships/${VALID_ID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, makeContext(VALID_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid UUID", async () => {
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    const req = new NextRequest("http://localhost/api/partnerships/bad-id", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeContext("bad-id"));
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful delete", async () => {
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    mockFrom.mockReturnValue(buildChain(null, null));
    const req = new NextRequest(`http://localhost/api/partnerships/${VALID_ID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, makeContext(VALID_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);
  });
});
