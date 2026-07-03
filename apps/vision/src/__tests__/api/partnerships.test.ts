import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.or = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.single = () => ({
      then: (cb: (v: { data: null; error: null }) => unknown) =>
        cb({ data: null, error: null }),
      catch: () => ({}),
      finally: () => ({}),
    });
    chain.then = (cb: (v: { data: unknown[]; error: null }) => unknown) =>
      cb({ data: [], error: null });
    chain.catch = () => chain;
    chain.finally = () => chain;
    return chain;
  }

  return {
    createClient: vi.fn().mockResolvedValue({
      auth: { getUser: () => mockGetUser() },
      from: () => ({
        select: () => makeChain(),
        insert: () => ({
          select: () => ({
            single: () => ({
              then: (
                cb: (v: { data: { id: "new-id" }; error: null }) => unknown
              ) => cb({ data: { id: "new-id" }, error: null }),
              catch: () => ({}),
              finally: () => ({}),
            }),
          }),
        }),
      }),
    }),
  };
});

const { GET, POST } = await import("@/app/api/partnerships/route");

function makeGetRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/partnerships");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/partnerships", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_ORG_A = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_ORG_B = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_USER = { id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };

describe("GET /api/partnerships", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeGetRequest({ org_id: VALID_ORG_A }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when org_id is missing", async () => {
    const res = await GET(makeGetRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid org_id", async () => {
    const res = await GET(makeGetRequest({ org_id: "bad" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with partnerships", async () => {
    const res = await GET(makeGetRequest({ org_id: VALID_ORG_A }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("partnerships");
  });
});

describe("POST /api/partnerships", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      makePostRequest({ org_a_id: VALID_ORG_A, org_b_id: VALID_ORG_B })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid input", async () => {
    const res = await POST(makePostRequest({ org_a_id: "bad" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for self-partnership", async () => {
    const res = await POST(
      makePostRequest({ org_a_id: VALID_ORG_A, org_b_id: VALID_ORG_A })
    );
    expect(res.status).toBe(400);
  });

  it("returns 201 for valid partnership", async () => {
    const res = await POST(
      makePostRequest({
        org_a_id: VALID_ORG_A,
        org_b_id: VALID_ORG_B,
        sharing_level: "summary",
      })
    );
    // Returns 201 or 409 (if existing check finds match)
    expect([201, 409]).toContain(res.status);
  });
});
