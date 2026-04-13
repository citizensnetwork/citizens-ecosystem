import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockInsert = vi.fn();

vi.mock("@/lib/supabase/server", () => {
  function makeChain() {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.gte = () => chain;
    chain.lte = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.then = (cb: (v: { data: unknown[]; error: null }) => unknown) =>
      cb({ data: [], error: null });
    chain.catch = () => chain;
    chain.finally = () => chain;
    return chain;
  }

  return {
    createClient: vi.fn().mockResolvedValue({
      auth: { getUser: () => mockGetUser() },
      from: (table: string) => {
        if (table === "export_logs") {
          return {
            insert: (...args: unknown[]) => {
              mockInsert(...args);
              return { error: null };
            },
          };
        }
        return {
          select: () => makeChain(),
        };
      },
    }),
  };
});

const { POST } = await import("@/app/api/export/route");

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/export", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };

describe("POST /api/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      makeRequest({ org_id: VALID_ORG, export_type: "csv", resource: "activities" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when org_id is missing", async () => {
    const res = await POST(
      makeRequest({ export_type: "csv", resource: "activities" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid export_type", async () => {
    const res = await POST(
      makeRequest({ org_id: VALID_ORG, export_type: "xml", resource: "activities" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid resource", async () => {
    const res = await POST(
      makeRequest({ org_id: VALID_ORG, export_type: "csv", resource: "secrets" })
    );
    expect(res.status).toBe(400);
  });

  it("returns CSV for activities export", async () => {
    const res = await POST(
      makeRequest({
        org_id: VALID_ORG,
        export_type: "csv",
        resource: "activities",
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
  });

  it("returns CSV for metrics export", async () => {
    const res = await POST(
      makeRequest({
        org_id: VALID_ORG,
        export_type: "csv",
        resource: "metrics",
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
  });

  it("returns JSON for PDF export", async () => {
    const res = await POST(
      makeRequest({
        org_id: VALID_ORG,
        export_type: "pdf",
        resource: "report",
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("message");
  });
});
