import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createMockSupabaseClient } from "../helpers/supabase-mock";

// ════════════════════════════════════════════════════════════════════
//  D-12: nothing of a PENDING Contributor applicant is public.
//
//  A pending applicant is `role = 'citizen'`, `contributor_status = 'pending'`,
//  with no `contributor_slug`; their profile edits are staged on
//  `contributor_applications` (owner + admins only). So the public surfaces
//  stay closed as long as every public contributor read keeps requiring
//  role = contributor AND status = approved AND (where it lists) not hidden.
//  These tests pin exactly that, at the API layer, so a future "simplifying"
//  edit to one of those queries fails here instead of leaking in production.
//  (The database half — RLS and the privilege revokes — is probed in
//  migration 180's rollback-only probe and pinned by
//  contributor-approval-migrations.test.ts.)
// ════════════════════════════════════════════════════════════════════

const mockClient = createMockSupabaseClient();
const chain = mockClient._chain as unknown as Record<string, unknown>;
for (const m of ["range", "is", "not", "or"]) chain[m] = vi.fn().mockReturnValue(chain);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
}));
vi.mock("@/lib/v1Gate", () => ({
  gateV1: vi.fn().mockResolvedValue({ key: null, identifier: "test" }),
}));

const detail = await import("@/app/api/v1/contributors/[slug]/route");
const stats = await import("@/app/api/v1/contributors/[slug]/stats/route");
const list = await import("@/app/api/v1/contributors/route");

const eqCalls = () => mockClient._chain.eq.mock.calls.map(([col, val]) => `${String(col)}=${String(val)}`);

beforeEach(() => {
  vi.clearAllMocks();
  mockClient._chain._result = { data: [], error: null, count: 0 };
  // The database finds no row matching the (approved-only) filters, which is what a pending applicant is.
  mockClient._chain.maybeSingle.mockResolvedValue({ data: null, error: null });
  mockClient._chain.single.mockResolvedValue({ data: null, error: null });
});

describe("a pending applicant is not reachable through the public API", () => {
  it("GET /api/v1/contributors/<slug> answers 404 and only ever matches approved, visible Contributors", async () => {
    const res = await detail.GET(new Request("http://localhost/api/v1/contributors/grace-hub"), {
      params: Promise.resolve({ slug: "grace-hub" }),
    });
    expect(res.status).toBe(404);
    const eqs = eqCalls();
    expect(eqs).toContain("contributor_slug=grace-hub");
    expect(eqs).toContain("role=contributor");
    expect(eqs).toContain("contributor_status=approved");
    expect(eqs).toContain("contributor_hidden=false");
    // And it never falls back to a bare slug match.
    expect(mockClient.from).toHaveBeenCalledWith("profiles");
  });

  it("GET /api/v1/contributors/<slug>/stats requires an approved Contributor", async () => {
    const res = await stats.GET(new Request("http://localhost/api/v1/contributors/grace-hub/stats"), {
      params: Promise.resolve({ slug: "grace-hub" }),
    });
    expect(res.status).toBe(404);
    const eqs = eqCalls();
    expect(eqs).toContain("role=contributor");
    expect(eqs).toContain("contributor_status=approved");
  });

  it("GET /api/v1/contributors (the feed behind the map and Kingdom Discovery) lists approved, visible Contributors only", async () => {
    const res = await list.GET(new Request("http://localhost/api/v1/contributors"));
    expect(res.status).toBe(200);
    const eqs = eqCalls();
    expect(eqs).toContain("role=contributor");
    expect(eqs).toContain("contributor_status=approved");
    expect(eqs).toContain("contributor_hidden=false");
  });
});

describe("no callable self-approval path remains in the application", () => {
  const SRC = join(__dirname, "..", "..");

  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === "__tests__" || name === "node_modules" || name === ".next") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) sourceFiles(full, out);
      else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(full);
    }
    return out;
  }

  it("nothing under src/ (routes, libs, the browser app) references the retired self_approve RPC", () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => readFileSync(f, "utf8").includes("self_approve_contributor_application"))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it("the apply route never sets a role, a slug or an approved status on the profile", () => {
    const apply = readFileSync(join(SRC, "app", "api", "contributor", "apply", "route.ts"), "utf8");
    expect(apply).not.toMatch(/\.rpc\(/);
    expect(apply).not.toMatch(/contributor_status:\s*["']approved["']/);
    expect(apply).not.toMatch(/role:\s*["']contributor["']/);
    expect(apply).not.toMatch(/contributor_slug/);
  });

  it("the applicant's own edit route cannot name status, user or reviewer columns", () => {
    const edit = readFileSync(join(SRC, "app", "api", "contributor", "application", "route.ts"), "utf8");
    // The PATCH builds its update only from keys it lists; none of these may ever be among them.
    for (const forbidden of ['"status"', '"user_id"', '"reviewer_id"', '"reviewed_at"', '"rejection_reason"']) {
      expect(edit.match(new RegExp(`update\\.${forbidden.replace(/"/g, "")}\\b`))).toBeNull();
    }
  });
});
