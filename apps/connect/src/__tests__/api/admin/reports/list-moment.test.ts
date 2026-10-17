import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// The moderation list names a reported note (migration 188) by its first words, and still lists it when the note is gone.

const ADMIN = "11111111-1111-4111-8111-111111111111";
const M1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let tables: string[] = [];
let answers: Record<string, { data: unknown; error: unknown }> = {};

function from(table: string) {
  tables.push(table);
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "order", "limit", "in", "eq"]) chain[op] = () => chain;
  chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(answers[table] ?? { data: [], error: null }).then(res, rej);
  return chain;
}

vi.mock("@/lib/supabase/route", () => ({ getRouteAuth: vi.fn().mockResolvedValue({ supabase: { from }, user: { id: ADMIN } }) }));
vi.mock("@/lib/adminGuard", () => ({ requireAdmin: vi.fn().mockResolvedValue({ ok: true, user: { id: ADMIN } }) }));

const { GET } = await import("@/app/api/admin/reports/route");

beforeEach(() => {
  tables = [];
  answers = {};
});

describe("GET /api/admin/reports: a reported moment", () => {
  it("is named by the first 80 characters of the note, and a note that is gone keeps a generic name", async () => {
    answers.reports = {
      data: [
        { id: "r1", reporter_id: ADMIN, target_type: "moment", target_id: M1, reason: "spam", body: null, status: "open", resolved_at: null, resolution_notes: null, created_at: "2026-10-17T10:00:00Z", reporter: null },
        { id: "r2", reporter_id: ADMIN, target_type: "moment", target_id: M2, reason: "spam", body: null, status: "open", resolved_at: null, resolution_notes: null, created_at: "2026-10-17T09:00:00Z", reporter: null },
      ],
      error: null,
    };
    answers.moments = { data: [{ id: M1, body: "x".repeat(200) }], error: null };
    const res = await GET(new NextRequest("http://localhost/api/admin/reports"));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.reports[0].target_name).toBe("Note: " + "x".repeat(80));
    expect(j.reports[1].target_name).toBe("A moment");
    expect(tables.filter((t) => t === "moments")).toHaveLength(1);   // one batched lookup, not one per row
  });

  it("makes no note lookup at all when no report is about a note", async () => {
    answers.reports = {
      data: [{ id: "r1", reporter_id: ADMIN, target_type: "conversation", target_id: M1, reason: "spam", body: null, status: "open", resolved_at: null, resolution_notes: null, created_at: "2026-10-17T10:00:00Z", reporter: null }],
      error: null,
    };
    await GET(new NextRequest("http://localhost/api/admin/reports"));
    expect(tables).not.toContain("moments");
  });
});
