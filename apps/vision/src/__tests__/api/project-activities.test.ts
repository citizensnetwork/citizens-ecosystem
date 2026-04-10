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
  "@/app/api/projects/[id]/activities/route"
);

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

function chainMock(value: unknown) {
  const m: Record<string, ReturnType<typeof vi.fn>> = {};
  m.select = vi.fn(() => m);
  m.eq = vi.fn(() => m);
  m.range = vi.fn(() => m);
  m.single = vi.fn(() => m);
  m.insert = vi.fn(() => m);
  m.delete = vi.fn(() => m);
  m.then = vi.fn((resolve: (v: unknown) => unknown) =>
    Promise.resolve(value).then(resolve)
  );
  return m;
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const ACTIVITY_ID = "770e8400-e29b-41d4-a716-446655440002";
const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/projects/[id]/activities", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(
      createRequest("GET", `http://localhost/api/projects/${VALID_UUID}/activities`),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid project ID", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await GET(
      createRequest("GET", "http://localhost/api/projects/bad-id/activities"),
      makeParams("bad-id")
    );
    expect(res.status).toBe(400);
  });

  it("returns paginated activities", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockSupabase.from.mockReturnValue(
      chainMock({
        data: [{ project_id: VALID_UUID, activity_id: ACTIVITY_ID }],
        count: 1,
        error: null,
      })
    );

    const res = await GET(
      createRequest("GET", `http://localhost/api/projects/${VALID_UUID}/activities`),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(1);
  });
});

describe("POST /api/projects/[id]/activities", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      createRequest("POST", `http://localhost/api/projects/${VALID_UUID}/activities`, {
        activity_id: ACTIVITY_ID,
      }),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid activity_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(
      createRequest("POST", `http://localhost/api/projects/${VALID_UUID}/activities`, {
        activity_id: "not-a-uuid",
      }),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(400);
  });

  it("links activity successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockSupabase.from.mockReturnValue(
      chainMock({
        data: { project_id: VALID_UUID, activity_id: ACTIVITY_ID },
        error: null,
      })
    );

    const res = await POST(
      createRequest("POST", `http://localhost/api/projects/${VALID_UUID}/activities`, {
        activity_id: ACTIVITY_ID,
      }),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(201);
  });

  it("returns 409 for duplicate link", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockSupabase.from.mockReturnValue(
      chainMock({
        data: null,
        error: { code: "23505", message: "duplicate" },
      })
    );

    const res = await POST(
      createRequest("POST", `http://localhost/api/projects/${VALID_UUID}/activities`, {
        activity_id: ACTIVITY_ID,
      }),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/projects/[id]/activities", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(
      createRequest(
        "DELETE",
        `http://localhost/api/projects/${VALID_UUID}/activities?activity_id=${ACTIVITY_ID}`
      ),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing activity_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await DELETE(
      createRequest(
        "DELETE",
        `http://localhost/api/projects/${VALID_UUID}/activities`
      ),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(400);
  });

  it("unlinks activity successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockSupabase.from.mockReturnValue(chainMock({ error: null }));

    const res = await DELETE(
      createRequest(
        "DELETE",
        `http://localhost/api/projects/${VALID_UUID}/activities?activity_id=${ACTIVITY_ID}`
      ),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
