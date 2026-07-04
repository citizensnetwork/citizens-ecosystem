import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

const { GET, POST, PATCH, DELETE } = await import(
  "@/app/api/projects/[id]/milestones/route"
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
  m.order = vi.fn(() => m);
  m.single = vi.fn(() => m);
  m.insert = vi.fn(() => m);
  m.update = vi.fn(() => m);
  m.delete = vi.fn(() => m);
  m.then = vi.fn((resolve: (v: unknown) => unknown) =>
    Promise.resolve(value).then(resolve)
  );
  return m;
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const MILESTONE_ID = "660e8400-e29b-41d4-a716-446655440001";
const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/projects/[id]/milestones", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(
      createRequest("GET", `http://localhost/api/projects/${VALID_UUID}/milestones`),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid project ID", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await GET(
      createRequest("GET", "http://localhost/api/projects/bad-id/milestones"),
      makeParams("bad-id")
    );
    expect(res.status).toBe(400);
  });

  it("returns milestones for valid project", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockSupabase.from.mockReturnValue(
      chainMock({ data: [{ id: "m1", title: "Phase 1" }], error: null })
    );

    const res = await GET(
      createRequest("GET", `http://localhost/api/projects/${VALID_UUID}/milestones`),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});

describe("POST /api/projects/[id]/milestones", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      createRequest("POST", `http://localhost/api/projects/${VALID_UUID}/milestones`, {
        title: "Test Milestone",
      }),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(
      createRequest("POST", `http://localhost/api/projects/${VALID_UUID}/milestones`, {
        title: "A", // too short
      }),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(400);
  });

  it("creates milestone successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    // First call: count for sort_order, second call: insert
    const countChain = chainMock({ count: 3 });
    const insertChain = chainMock({
      data: { id: "m1", title: "Phase 1 Complete", sort_order: 3 },
      error: null,
    });

    mockSupabase.from
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(insertChain);

    const res = await POST(
      createRequest("POST", `http://localhost/api/projects/${VALID_UUID}/milestones`, {
        title: "Phase 1 Complete",
      }),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.title).toBe("Phase 1 Complete");
  });
});

describe("PATCH /api/projects/[id]/milestones", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(
      createRequest("PATCH", `http://localhost/api/projects/${VALID_UUID}/milestones`, {
        milestone_id: MILESTONE_ID,
        completed_at: new Date().toISOString(),
      }),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing milestone_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await PATCH(
      createRequest("PATCH", `http://localhost/api/projects/${VALID_UUID}/milestones`, {
        completed_at: new Date().toISOString(),
      }),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("milestone_id");
  });

  it("updates milestone successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockSupabase.from.mockReturnValue(
      chainMock({
        data: { id: MILESTONE_ID, completed_at: "2026-06-15T12:00:00.000Z" },
        error: null,
      })
    );

    const res = await PATCH(
      createRequest("PATCH", `http://localhost/api/projects/${VALID_UUID}/milestones`, {
        milestone_id: MILESTONE_ID,
        completed_at: "2026-06-15T12:00:00.000Z",
      }),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.completed_at).toBe("2026-06-15T12:00:00.000Z");
  });
});

describe("DELETE /api/projects/[id]/milestones", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for unauthenticated requests", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(
      createRequest(
        "DELETE",
        `http://localhost/api/projects/${VALID_UUID}/milestones?milestone_id=${MILESTONE_ID}`
      ),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing milestone_id", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await DELETE(
      createRequest(
        "DELETE",
        `http://localhost/api/projects/${VALID_UUID}/milestones`
      ),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(400);
  });

  it("deletes milestone successfully", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockSupabase.from.mockReturnValue(chainMock({ error: null }));

    const res = await DELETE(
      createRequest(
        "DELETE",
        `http://localhost/api/projects/${VALID_UUID}/milestones?milestone_id=${MILESTONE_ID}`
      ),
      makeParams(VALID_UUID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
