import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { resetRateLimitStore } from "@/lib/rate-limit";

const mockClient = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));

const { POST, GET } = await import("@/app/api/suggestions/route");
const { PATCH } = await import("@/app/api/suggestions/[id]/route");
const { GET: EXPORT_GET } = await import(
  "@/app/api/admin/suggestions/export/route"
);

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";
const SUGGESTION_ID = "33333333-3333-3333-3333-333333333333";

function makeReq(method: string = "POST", body?: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/suggestions", {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
}

function makePatchParams() {
  return { params: Promise.resolve({ id: SUGGESTION_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimitStore();
});

describe("POST /api/suggestions", () => {
  it("rejects body shorter than 10 chars", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const res = await POST(
      makeReq("POST", {
        title: "Hello",
        body: "short",
        page_url: "http://localhost/",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects non-http page_url (javascript: scheme)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const res = await POST(
      makeReq("POST", {
        title: "Bug report",
        body: "Something went wrong on this page.",
        page_url: "javascript:alert(1)",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("strips control chars and writes a sanitised suggestion", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.single.mockResolvedValueOnce({
      data: { id: SUGGESTION_ID },
      error: null,
    });
    const res = await POST(
      makeReq("POST", {
        title: "Fix\x00 the search",
        body: "Search returns 0 results when it should not. Please look at this.",
        page_url: "http://localhost/events",
      }),
    );
    expect(res.status).toBe(201);
    const insertArgs = mockClient._chain.insert.mock.calls[0]?.[0];
    expect(insertArgs.title).not.toContain("\x00");
    expect(insertArgs.user_id).toBe(USER_ID);
  });

  it("allows anonymous submissions (user_id = null)", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    mockClient._chain.single.mockResolvedValueOnce({
      data: { id: SUGGESTION_ID },
      error: null,
    });
    const res = await POST(
      makeReq("POST", {
        title: "Anon idea",
        body: "An anonymous suggestion from a curious citizen.",
        page_url: "http://localhost/",
      }),
    );
    expect(res.status).toBe(201);
    const insertArgs = mockClient._chain.insert.mock.calls[0]?.[0];
    expect(insertArgs.user_id).toBeNull();
  });

  it("returns 429 after 10 submissions in 24h", async () => {
    // Fire 10 successful submissions for the same authenticated user.
    for (let i = 0; i < 10; i++) {
      mockClient.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: USER_ID } },
        error: null,
      });
      mockClient._chain.single.mockResolvedValueOnce({
        data: { id: SUGGESTION_ID },
        error: null,
      });
      const ok = await POST(
        makeReq("POST", {
          title: `Suggestion ${i}`,
          body: "Body text long enough to pass validation rules.",
          page_url: "http://localhost/",
        }),
      );
      expect(ok.status).toBe(201);
    }
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const res = await POST(
      makeReq("POST", {
        title: "11th",
        body: "Body text long enough to pass validation rules.",
        page_url: "http://localhost/",
      }),
    );
    expect(res.status).toBe(429);
  });
});

describe("GET /api/suggestions (admin list)", () => {
  it("returns 401 when unauthenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { role: "citizen" },
      error: null,
    });
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/suggestions/[id]", () => {
  it("uses suggestion_response notification type when actioned", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    // admin role lookup
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { role: "admin" },
      error: null,
    });
    // suggestion update result
    mockClient._chain.single.mockResolvedValueOnce({
      data: { id: SUGGESTION_ID, user_id: USER_ID, status: "actioned" },
      error: null,
    });

    const res = await PATCH(
      makeReq("PATCH", { status: "actioned", admin_response: "Great idea!" }),
      makePatchParams(),
    );
    expect(res.status).toBe(200);

    // The notifications insert call should use the new type.
    const allInsertCalls = mockClient._chain.insert.mock.calls;
    const notifInsert = allInsertCalls.find(
      (c) => (c[0] as { type?: string })?.type === "suggestion_response",
    );
    expect(notifInsert).toBeDefined();
    const notif = notifInsert?.[0] as {
      type: string;
      user_id: string;
      data: { suggestion_id: string; status: string };
    };
    expect(notif.user_id).toBe(USER_ID);
    expect(notif.data.suggestion_id).toBe(SUGGESTION_ID);
    expect(notif.data.status).toBe("actioned");
  });

  it("rejects invalid status", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { role: "admin" },
      error: null,
    });
    const res = await PATCH(
      makeReq("PATCH", { status: "deleted" }),
      makePatchParams(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin viewer", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { role: "citizen" },
      error: null,
    });
    const res = await PATCH(
      makeReq("PATCH", { status: "actioned" }),
      makePatchParams(),
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/admin/suggestions/export", () => {
  it("returns 401 when unauthenticated", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const res = await EXPORT_GET(
      new NextRequest("http://localhost/api/admin/suggestions/export"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { role: "citizen" },
      error: null,
    });
    const res = await EXPORT_GET(
      new NextRequest("http://localhost/api/admin/suggestions/export"),
    );
    expect(res.status).toBe(403);
  });

  it("neutralises CSV formula injection in user-supplied fields", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { role: "admin" },
      error: null,
    });
    mockClient._chain._result.data = [
      {
        id: SUGGESTION_ID,
        created_at: "2026-01-01T00:00:00Z",
        status: "open",
        title: "=cmd|'/c calc'!A0",
        body: "@SUM(A1:A10)",
        page_url: "http://localhost/",
        user_id: USER_ID,
        admin_response: null,
        resolved_at: null,
        resolved_by: null,
        user: { full_name: "Attacker", email: "x@example.com" },
      },
    ];
    const res = await EXPORT_GET(
      new NextRequest(
        "http://localhost/api/admin/suggestions/export?format=csv",
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    // Must prefix `=` and `@` with single-quote to disarm Excel formulas
    expect(body).toContain("'=cmd");
    expect(body).toContain("'@SUM");
    mockClient._chain._result.data = null;
  });

  it("serves a real OOXML workbook when format=xlsx", async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: ADMIN_ID } },
      error: null,
    });
    mockClient._chain.maybeSingle.mockResolvedValueOnce({
      data: { role: "admin" },
      error: null,
    });
    // The query chain resolves directly (thenable) → return rows
    mockClient._chain._result.data = [
      {
        id: SUGGESTION_ID,
        created_at: "2026-01-01T00:00:00Z",
        status: "open",
        title: "Hello",
        body: "Body, with comma",
        page_url: "http://localhost/events",
        user_id: USER_ID,
        admin_response: null,
        resolved_at: null,
        resolved_by: null,
        user: { full_name: "Jane Doe", email: "jane@example.com" },
      },
    ];
    const res = await EXPORT_GET(
      new NextRequest(
        "http://localhost/api/admin/suggestions/export?format=xlsx&status=open",
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain(
      "spreadsheetml.sheet",
    );
    expect(res.headers.get("Content-Disposition")).toContain(".xlsx");
    // Real .xlsx: a ZIP container (PK..) carrying inline-string worksheet XML.
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
    const text = buf.toString("latin1");
    expect(text).toContain("xl/worksheets/sheet1.xml");
    expect(text).toContain('<t xml:space="preserve">Hello</t>');
    // Comma-bearing value is plain cell text (no CSV quoting in xlsx).
    expect(text).toContain('<t xml:space="preserve">Body, with comma</t>');
    expect(text).toContain('<t xml:space="preserve">Jane Doe</t>');
    // reset for downstream tests
    mockClient._chain._result.data = null;
  });
});
