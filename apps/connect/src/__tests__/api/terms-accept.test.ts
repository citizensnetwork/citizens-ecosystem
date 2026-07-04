import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/rate-limit";

type ChainResult = { data: unknown; error: unknown };

function makeChain(result: ChainResult = { data: null, error: null }) {
  const chain = {
    _result: result,
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    single: vi.fn(),
  } as {
    _result: ChainResult;
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    then?: unknown;
  };
  for (const key of ["select", "insert", "update", "eq", "is"] as const) {
    chain[key].mockReturnValue(chain);
  }
  chain.single.mockImplementation(() => Promise.resolve(chain._result));
  chain.then = (resolve: (v: ChainResult) => void) =>
    Promise.resolve(chain._result).then(resolve);
  return chain;
}

const USER_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const TEMPLATE_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

// Chains per table, reset in beforeEach
let templateChain: ReturnType<typeof makeChain>;
let signatureChain: ReturnType<typeof makeChain>;
let profileUpdateChain: ReturnType<typeof makeChain>;

const authGetUser = vi.fn();

const mockClient = {
  auth: { getUser: authGetUser },
  from: vi.fn((table: string) => {
    if (table === "indemnity_templates") return templateChain;
    if (table === "indemnity_signatures") return signatureChain;
    if (table === "profiles") return profileUpdateChain;
    return makeChain();
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST } = await import("@/app/api/terms/accept/route");

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/terms/accept", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("POST /api/terms/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    templateChain = makeChain({
      data: { id: TEMPLATE_ID, version: 1 },
      error: null,
    });
    signatureChain = makeChain({ data: null, error: null });
    profileUpdateChain = makeChain({ data: null, error: null });
  });

  it("returns 401 when unauthenticated", async () => {
    authGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await POST(makeReq({ full_name: "Thandi Mokoena" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when JSON is invalid", async () => {
    authGetUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const res = await POST(makeReq("not-json-at-all"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when full_name is missing or too short", async () => {
    authGetUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const res = await POST(makeReq({ full_name: "a" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 and writes signature + profile on first acceptance", async () => {
    authGetUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const res = await POST(
      makeReq({ full_name: "Thandi Mokoena" }, { "x-forwarded-for": "1.2.3.4" }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("Accepted");
    expect(signatureChain.insert).toHaveBeenCalledTimes(1);
    const insertPayload = signatureChain.insert.mock.calls[0][0];
    expect(insertPayload.template_id).toBe(TEMPLATE_ID);
    expect(insertPayload.user_id).toBe(USER_ID);
    expect(insertPayload.full_name).toBe("Thandi Mokoena");
    expect(insertPayload.event_id).toBeNull();
    expect(insertPayload.place_id).toBeNull();
    expect(insertPayload.ip_address).toBe("1.2.3.4");
    expect(profileUpdateChain.update).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: returns 'Already accepted' when signature already exists", async () => {
    authGetUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });
    // Simulate 23505 on signature insert
    signatureChain.insert.mockReturnValueOnce({
      ...signatureChain,
      _result: { data: null, error: { code: "23505" } },
      then: (resolve: (v: ChainResult) => void) =>
        Promise.resolve({ data: null, error: { code: "23505" } }).then(resolve),
    } as unknown as typeof signatureChain);
    const res = await POST(makeReq({ full_name: "Thandi Mokoena" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("Already accepted");
    // Race-free profile update still dispatched — DB-level .is() filter
    // no-ops when terms_accepted_at already set, preserving original timestamp.
    expect(profileUpdateChain.update).toHaveBeenCalledTimes(1);
  });

  it("rate-limits after repeated calls", async () => {
    authGetUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });
    // auth limit is 10/min — fire 11
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await POST(makeReq({ full_name: "Thandi Mokoena" }));
    }
    expect(last?.status).toBe(429);
  });
});
