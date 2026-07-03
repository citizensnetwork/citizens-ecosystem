import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { DELETE } = await import(
  "@/app/api/events/[id]/updates/[updateId]/route"
);

const EVENT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const UPDATE_ID = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";
const USER_ID = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

function makeReq() {
  return new Request(
    `http://localhost/api/events/${EVENT_ID}/updates/${UPDATE_ID}`,
    { method: "DELETE" },
  );
}

function makeChain(result: { data: unknown; error: unknown }) {
  const chain = {
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

describe("DELETE /api/events/[id]/updates/[updateId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid UUIDs with 400", async () => {
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: "not-a-uuid", updateId: UPDATE_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: EVENT_ID, updateId: UPDATE_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when RLS rejects the delete", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const fromMock = mockClient.from as ReturnType<typeof vi.fn>;
    fromMock.mockReturnValueOnce(
      makeChain({
        data: null,
        error: {
          code: "42501",
          message: "new row violates row-level security policy",
        },
      }),
    );
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: EVENT_ID, updateId: UPDATE_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the row does not exist or is hidden by RLS", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const fromMock = mockClient.from as ReturnType<typeof vi.fn>;
    fromMock.mockReturnValueOnce(makeChain({ data: null, error: null }));
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: EVENT_ID, updateId: UPDATE_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 on a successful delete", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const fromMock = mockClient.from as ReturnType<typeof vi.fn>;
    const chain = makeChain({ data: { id: UPDATE_ID }, error: null });
    fromMock.mockReturnValueOnce(chain);
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: EVENT_ID, updateId: UPDATE_ID }),
    });
    expect(res.status).toBe(200);
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("event_id", EVENT_ID);
    expect(chain.eq).toHaveBeenCalledWith("id", UPDATE_ID);
  });
});
