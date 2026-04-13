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
  chain.single = () => Promise.resolve({ data, error });
  chain.update = () => chain;
  chain.delete = () => ({ eq: () => Promise.resolve({ error }) });
  return chain;
}

const { GET, PATCH, DELETE } = await import("@/app/api/reports/[id]/route");

const VALID_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/reports/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest(`http://localhost/api/reports/${VALID_ID}`);
    const res = await GET(req, makeParams(VALID_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid UUID", async () => {
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    const req = new NextRequest("http://localhost/api/reports/bad-id");
    const res = await GET(req, makeParams("bad-id"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when report not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    mockFrom.mockReturnValue(buildChain(null, { code: "PGRST116" }));
    const req = new NextRequest(`http://localhost/api/reports/${VALID_ID}`);
    const res = await GET(req, makeParams(VALID_ID));
    expect(res.status).toBe(404);
  });

  it("returns 200 with report data", async () => {
    const report = { id: VALID_ID, name: "Weekly Summary", frequency: "weekly" };
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    mockFrom.mockReturnValue(buildChain(report));
    const req = new NextRequest(`http://localhost/api/reports/${VALID_ID}`);
    const res = await GET(req, makeParams(VALID_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("Weekly Summary");
  });
});

describe("PATCH /api/reports/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest(`http://localhost/api/reports/${VALID_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await PATCH(req, makeParams(VALID_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid UUID", async () => {
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    const req = new NextRequest("http://localhost/api/reports/bad-id", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await PATCH(req, makeParams("bad-id"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    const req = new NextRequest(`http://localhost/api/reports/${VALID_ID}`, {
      method: "PATCH",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await PATCH(req, makeParams(VALID_ID));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid frequency value", async () => {
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    const req = new NextRequest(`http://localhost/api/reports/${VALID_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ frequency: "hourly" }),
    });
    const res = await PATCH(req, makeParams(VALID_ID));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no valid fields provided", async () => {
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    const req = new NextRequest(`http://localhost/api/reports/${VALID_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ unknown_field: "value" }),
    });
    const res = await PATCH(req, makeParams(VALID_ID));
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful update", async () => {
    const updated = { id: VALID_ID, name: "Updated Report", frequency: "daily" };
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    mockFrom.mockReturnValue(buildChain(updated));
    const req = new NextRequest(`http://localhost/api/reports/${VALID_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated Report" }),
    });
    const res = await PATCH(req, makeParams(VALID_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("Updated Report");
  });
});

describe("DELETE /api/reports/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest(`http://localhost/api/reports/${VALID_ID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams(VALID_ID));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid UUID", async () => {
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    const req = new NextRequest("http://localhost/api/reports/bad-id", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams("bad-id"));
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful delete", async () => {
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    mockFrom.mockReturnValue(buildChain(null, null));
    const req = new NextRequest(`http://localhost/api/reports/${VALID_ID}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, makeParams(VALID_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);
  });
});
