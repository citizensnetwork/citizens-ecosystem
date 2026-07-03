import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type ChainResult = { data: unknown; error: unknown };

function makeChain(result: ChainResult = { data: null, error: null }) {
  const chain = {
    _result: result,
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  } as {
    _result: ChainResult;
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  };
  for (const key of ["select", "eq", "limit"] as const) {
    chain[key].mockReturnValue(chain);
  }
  chain.single.mockImplementation(() => Promise.resolve(chain._result));
  chain.maybeSingle.mockImplementation(() => Promise.resolve(chain._result));
  return chain;
}

const USER_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const TEMPLATE_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

let templateChain: ReturnType<typeof makeChain>;
let signatureChain: ReturnType<typeof makeChain>;
const authGetUser = vi.fn();

const mockClient = {
  auth: { getUser: authGetUser },
  from: vi.fn((table: string) => {
    if (table === "indemnity_templates") return templateChain;
    if (table === "indemnity_signatures") return signatureChain;
    return makeChain();
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { GET } = await import("@/app/api/indemnity/template/route");

function req(url: string) {
  return new NextRequest(url);
}

describe("GET /api/indemnity/template", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    templateChain = makeChain({
      data: {
        id: TEMPLATE_ID,
        slug: "attendee-participation-waiver",
        title: "Event Participation Waiver",
        body: "…",
        version: 1,
        applies_to: "events",
        required: false,
      },
      error: null,
    });
    signatureChain = makeChain({ data: null, error: null });
  });

  it("returns 400 when slug is missing", async () => {
    const res = await GET(req("http://localhost/api/indemnity/template"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when template does not exist", async () => {
    templateChain = makeChain({
      data: null,
      error: { message: "not found", code: "PGRST116" },
    });
    const res = await GET(
      req("http://localhost/api/indemnity/template?slug=nope"),
    );
    expect(res.status).toBe(404);
  });

  it("returns template with hasSigned=false when user has no signature", async () => {
    authGetUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const res = await GET(
      req(
        "http://localhost/api/indemnity/template?slug=attendee-participation-waiver",
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.template.id).toBe(TEMPLATE_ID);
    expect(json.hasSigned).toBe(false);
  });

  it("returns hasSigned=true when user has signature", async () => {
    authGetUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    signatureChain = makeChain({ data: { id: "sig-1" }, error: null });
    const res = await GET(
      req(
        "http://localhost/api/indemnity/template?slug=attendee-participation-waiver",
      ),
    );
    const json = await res.json();
    expect(json.hasSigned).toBe(true);
  });

  it("returns hasSigned=false when unauthenticated", async () => {
    authGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const res = await GET(
      req(
        "http://localhost/api/indemnity/template?slug=attendee-participation-waiver",
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hasSigned).toBe(false);
    expect(json.template).toBeDefined();
  });
});
