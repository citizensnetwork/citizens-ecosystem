import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockReportData = vi.fn();
const mockInsertData = vi.fn();

vi.mock("@/lib/supabase/server", () => {
  return {
    createClient: vi.fn().mockResolvedValue({
      auth: { getUser: () => mockGetUser() },
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              then: (cb: (v: { data: unknown[]; error: null }) => unknown) =>
                cb({ data: mockReportData() ?? [], error: null }),
              catch: () => ({}),
              finally: () => ({}),
            }),
          }),
        }),
        insert: (...args: unknown[]) => {
          mockInsertData(...args);
          return {
            select: () => ({
              single: () => ({
                then: (
                  cb: (v: { data: { id: "new-id" }; error: null }) => unknown
                ) => cb({ data: { id: "new-id" }, error: null }),
                catch: () => ({}),
                finally: () => ({}),
              }),
            }),
          };
        },
      }),
    }),
  };
});

const { GET, POST } = await import("@/app/api/reports/route");

function makeGetRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/reports");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/reports", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_USER = { id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };

describe("GET /api/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
    mockReportData.mockReturnValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeGetRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when org_id is missing", async () => {
    const res = await GET(makeGetRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 200 with reports", async () => {
    const res = await GET(makeGetRequest({ org_id: VALID_ORG }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("reports");
  });
});

describe("POST /api/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: VALID_USER } });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      makePostRequest({
        org_id: VALID_ORG,
        name: "Weekly Report",
        frequency: "weekly",
        recipients: ["test@test.com"],
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    const res = await POST(
      makePostRequest({
        org_id: VALID_ORG,
        frequency: "weekly",
        recipients: ["test@test.com"],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid frequency", async () => {
    const res = await POST(
      makePostRequest({
        org_id: VALID_ORG,
        name: "Test",
        frequency: "hourly",
        recipients: ["test@test.com"],
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when recipients is empty", async () => {
    const res = await POST(
      makePostRequest({
        org_id: VALID_ORG,
        name: "Test",
        frequency: "weekly",
        recipients: [],
      })
    );
    expect(res.status).toBe(400);
  });
});
