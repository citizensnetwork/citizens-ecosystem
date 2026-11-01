// @vitest-environment node
/**
 * Static twin of migration 201. CI has no database, so this pins the
 * promises the file makes: a public boolean, a tight write guard, and
 * the editor function restated with an empty search_path.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "../..");
const sql = readFileSync(join(ROOT, "supabase/migrations/201_open_to_collaborate.sql"), "utf8");
const flat = sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").toLowerCase();

function fn(name: string): { header: string; body: string } {
  const start = new RegExp(`create or replace function public\\.${name}\\s*\\(`, "i").exec(sql);
  expect(start, name).not.toBeNull();
  const from = start!.index;
  const open = /\$([A-Za-z_]*)\$/.exec(sql.slice(from))!;
  const tag = open[0];
  const bodyStart = from + open.index + tag.length;
  const bodyEnd = sql.indexOf(tag, bodyStart);
  return {
    header: sql.slice(from, from + open.index).replace(/\s+/g, " ").toLowerCase(),
    body: sql.slice(bodyStart, bodyEnd).replace(/\s+/g, " ").toLowerCase(),
  };
}

describe("migration 201 open to collaborate", () => {
  it("adds a not-null boolean that defaults to false and grants column select only", () => {
    expect(flat).toContain(
      "add column if not exists open_to_collaborate boolean not null default false",
    );
    expect(flat).toContain(
      "grant select (open_to_collaborate) on table public.profiles to anon, authenticated",
    );
    expect(flat).not.toMatch(/grant select on (table )?public\.profiles to/);
    expect(flat).not.toContain("create view");
    expect(flat).not.toContain("create policy");
  });

  it("guards the column for the listing owner and refuses a missing jwt", () => {
    const guard = fn("guard_open_to_collaborate");
    expect(guard.header).toContain("security invoker");
    expect(guard.header).toMatch(/set search_path = ''/);
    expect(guard.body).toContain("auth.uid() is null");
    expect(guard.body).toContain("auth.uid() is distinct from old.id");
    expect(guard.body).toContain("old.role is distinct from 'contributor'");
    expect(guard.body).toContain("old.contributor_status is distinct from 'approved'");
    expect(guard.body).toContain("old.deleted_at is not null");
    expect(guard.body).toContain("current_user not in ('anon', 'authenticated')");
    expect(guard.body).toContain("public.is_admin()");
    expect(flat).toContain(
      "revoke all on function public.guard_open_to_collaborate() from public, anon, authenticated",
    );
  });

  it("restates the editor writer with the flag on the allow-list and a boolean check", () => {
    const rpc = fn("update_contributor_public_profile");
    expect(rpc.header).toContain("security definer");
    expect(rpc.header).toMatch(/set search_path = ''/);
    expect(rpc.body).toContain("v_uid is null");
    expect(rpc.body).toContain("public.is_active_team_member(p_contributor_id, array['editor'])");
    expect(rpc.body).toContain("'open_to_collaborate'");
    expect(rpc.body).toContain("jsonb_typeof(p_patch->'open_to_collaborate') <> 'boolean'");
    expect(rpc.body).toContain("forbidden_field");
    for (const banned of ["billing_tier", "role", "contributor_status", "contributor_hidden", "email"]) {
      expect(rpc.body, banned).not.toContain(`'${banned}'`);
    }
    expect(flat).toContain(
      "revoke all on function public.update_contributor_public_profile(uuid, jsonb) from public, anon",
    );
    expect(flat).toContain(
      "grant execute on function public.update_contributor_public_profile(uuid, jsonb) to authenticated",
    );
  });
});

describe("the profile write routes keep the existing walls", () => {
  const owner = readFileSync(join(process.cwd(), "src/app/api/contributor/profile/route.ts"), "utf8");
  const editor = readFileSync(
    join(process.cwd(), "src/app/api/contributor/[handle]/profile/route.ts"),
    "utf8",
  );

  it("both routes authenticate with getRouteAuth, rate-limit, and accept only a boolean flag", () => {
    for (const src of [owner, editor]) {
      const post = src.slice(src.indexOf("export async function POST"));
      const authAt = post.indexOf("await getRouteAuth(request)");
      const limitAt = post.indexOf("await checkRateLimit");
      const writeAt = Math.max(post.lastIndexOf(".update("), post.lastIndexOf(".rpc("));
      expect(authAt).toBeGreaterThanOrEqual(0);
      expect(limitAt).toBeGreaterThan(authAt);
      expect(writeAt).toBeGreaterThan(limitAt);
      expect(src).toContain('"open_to_collaborate"');
      expect(src).toContain("open_to_collaborate must be a boolean");
    }
  });

  it("an editor still cannot name a server-owned column", () => {
    for (const field of ["billing_tier", "role", "contributor_slug", "contributor_status", "email"]) {
      expect(editor).not.toContain(`"${field}"`);
    }
  });
});
