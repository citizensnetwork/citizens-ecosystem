import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockSupabaseClient } from "../../helpers/supabase-mock";
import { createFakeTables, type Row } from "../../helpers/fake-tables";

// The admin gate runs on the caller's own client (as in users.test.ts) ...
const mockClient = createMockSupabaseClient();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue(mockClient) }));

// ... and the list itself on the service-role client, here an in-memory fake.
let fake = createFakeTables(["profiles", "listing_suggestions"]);
const createAdminClient = vi.fn(() => ({ from: (table: string) => fake.from(table) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => createAdminClient() }));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue({ success: true, resetMs: 0 }) };
});

const { GET } = await import("@/app/api/admin/users/route");

const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const req = (qs = "?role=contributor") => new NextRequest(`http://localhost/api/admin/users${qs}`, { method: "GET" });
const pending = (contributor_id: string, status = "pending"): Row => ({ contributor_id, status });

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakeTables(["profiles", "listing_suggestions"]);
  mockClient._chain._result.data = { role: "admin" };
  mockClient._chain._result.error = null;
  mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: ADMIN_ID, email: "a@example.com" } }, error: null });
  fake.state.profiles = [
    { id: A, role: "contributor", full_name: "First Org", auto_update_level: "events_auto" },
    { id: B, role: "contributor", full_name: "Second Org", auto_update_level: "off" },
    { id: C, role: "citizen", full_name: "A Citizen", auto_update_level: "off" },
  ];
  fake.state.listing_suggestions = [pending(A), pending(A), pending(A, "dismissed"), pending(A, "auto_published"), pending(B, "published"), pending(C)];
});

describe("GET /api/admin/users: automation on the Listings rows (mig 181)", () => {
  it("adds each Contributor's level and PENDING suggestion count, and nothing else's", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const byId = Object.fromEntries((data as Row[]).map((r) => [r.id as string, r]));
    expect(byId[A]).toMatchObject({ auto_update_level: "events_auto", pending_suggestions: 2 });
    expect(byId[B]).toMatchObject({ auto_update_level: "off", pending_suggestions: 0 });
  });

  it("leaves a non-Contributor row exactly as it was", async () => {
    const { data } = await (await GET(req("?q=x"))).json();
    const citizen = (data as Row[]).find((r) => r.id === C)!;
    expect(citizen).not.toHaveProperty("auto_update_level");
    expect(citizen).not.toHaveProperty("pending_suggestions");
  });

  it("uses the one service-role client, and only after the admin gate", async () => {
    mockClient._chain._result.data = { role: "citizen" };
    expect((await GET(req())).status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
    mockClient._chain._result.data = { role: "admin" };
    await GET(req());
    expect(createAdminClient).toHaveBeenCalledTimes(1);
  });

  it("if the automation tables are missing (migration not applied) the list is unchanged and still 200", async () => {
    fake = createFakeTables(["profiles"]); // no listing_suggestions: the lookup throws
    fake.state.profiles = [{ id: A, role: "contributor", full_name: "First Org" }];
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([{ id: A, role: "contributor", full_name: "First Org" }]);
  });
});
