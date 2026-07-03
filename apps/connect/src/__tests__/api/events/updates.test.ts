import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST, GET } = await import("@/app/api/events/[id]/updates/route");

const EVENT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const USER_ID = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/events/${EVENT_ID}/updates`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/events/[id]/updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const res = await POST(makeRequest({ body: "Hello" }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is empty", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const res = await POST(makeRequest({ body: "   " }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when body exceeds 1000 characters", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const res = await POST(makeRequest({ body: "x".repeat(1001) }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 when RLS rejects insert (non-organiser)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const fromMock = mockClient.from as ReturnType<typeof vi.fn>;
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "new row violates row-level security policy" },
      }),
    };
    fromMock.mockReturnValueOnce(chain);
    const res = await POST(makeRequest({ body: "Hello team!" }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 201 with the new update on success", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const fromMock = mockClient.from as ReturnType<typeof vi.fn>;
    const created = {
      id: "upd-1",
      event_id: EVENT_ID,
      author_id: USER_ID,
      body: "Hello team",
      created_at: new Date().toISOString(),
    };
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: created, error: null }),
    };
    fromMock.mockReturnValueOnce(chain);

    const res = await POST(makeRequest({ body: "Hello team" }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.update).toEqual(created);
    expect(chain.insert).toHaveBeenCalledWith({
      event_id: EVENT_ID,
      author_id: USER_ID,
      body: "Hello team",
    });
  });
});

describe("GET /api/events/[id]/updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns updates for the event", async () => {
    const fromMock = mockClient.from as ReturnType<typeof vi.fn>;
    const rows = [{ id: "u1", event_id: EVENT_ID, author_id: USER_ID, body: "Hi", created_at: "" }];
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    fromMock.mockReturnValueOnce(chain);

    const res = await GET(new Request(`http://localhost/api/events/${EVENT_ID}/updates`), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.updates).toEqual(rows);
  });
});
