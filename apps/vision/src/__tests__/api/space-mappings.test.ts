import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockListCategories = vi.fn();

class FakeConnectApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
    rpc: (fn: string, args: unknown) => mockRpc(fn, args),
  }),
}));

vi.mock("@/lib/connect/api", () => ({
  connectApi: { listCategories: (args: unknown) => mockListCategories(args) },
  ConnectApiError: FakeConnectApiError,
}));

const { GET, PUT } = await import("@/app/api/spaces/mappings/route");

const ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };
const CAT1 = "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const CAT2 = "10eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const SP1 = "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function req(method: string, params: Record<string, string>, body?: unknown) {
  const url = new URL("http://localhost/api/spaces/mappings");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("GET /api/spaces/mappings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockRpc.mockResolvedValue({ data: [{ category_id: CAT1, space_id: SP1 }], error: null });
    mockListCategories.mockResolvedValue({
      data: [
        { id: CAT1, name: "Worship", slug: "worship", emoji: "🙏", color: "#a", applies_to: "events", sort_order: 0, event_count: 3 },
        { id: CAT2, name: "Youth", slug: "youth", emoji: "🧒", color: "#b", applies_to: "events", sort_order: 1, event_count: 1 },
      ],
      meta: {},
    });
  });

  it("401 when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(req("GET", { org_id: ORG }))).status).toBe(401);
  });

  it("400 on invalid org_id", async () => {
    expect((await GET(req("GET", { org_id: "nope" }))).status).toBe(400);
  });

  it("joins Connect categories with the current assignment", async () => {
    const res = await GET(req("GET", { org_id: ORG }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data.find((c: { id: string }) => c.id === CAT1).space_id).toBe(SP1);
    expect(body.data.find((c: { id: string }) => c.id === CAT2).space_id).toBeNull();
  });

  it("403 when get_category_spaces raises the membership gate", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect((await GET(req("GET", { org_id: ORG }))).status).toBe(403);
  });

  it("502 when the Connect categories API is unavailable", async () => {
    mockListCategories.mockRejectedValue(new FakeConnectApiError("down", 500));
    expect((await GET(req("GET", { org_id: ORG }))).status).toBe(502);
  });
});

describe("PUT /api/spaces/mappings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  it("assigns a category to a space via set_category_space", async () => {
    const res = await PUT(req("PUT", { org_id: ORG }, { category_id: CAT1, space_id: SP1 }));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("set_category_space", {
      p_org_id: ORG,
      p_category_id: CAT1,
      p_space_id: SP1,
    });
  });

  it("clears an assignment with space_id null", async () => {
    const res = await PUT(req("PUT", { org_id: ORG }, { category_id: CAT1, space_id: null }));
    expect(res.status).toBe(200);
  });

  it("400 on validation failure", async () => {
    expect((await PUT(req("PUT", { org_id: ORG }, { category_id: "nope", space_id: null }))).status).toBe(400);
  });

  it("403 on the admin gate (42501)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect((await PUT(req("PUT", { org_id: ORG }, { category_id: CAT1, space_id: SP1 }))).status).toBe(403);
  });

  it("400 when the writer rejects (22023 — unlinked / foreign space)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "22023", message: "not linked" } });
    expect((await PUT(req("PUT", { org_id: ORG }, { category_id: CAT1, space_id: SP1 }))).status).toBe(400);
  });
});
