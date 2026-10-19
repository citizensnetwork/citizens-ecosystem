// @vitest-environment node
/**
 * Static twin of migration 193. A database is not available in CI, so this
 * pins the promises the migration makes: editors write an allow-list only,
 * viewers get no write policy, and profiles UPDATE is not widened.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "../..", "supabase/migrations/193_team_editor_listing_access.sql");
const sql = readFileSync(FILE, "utf8").replace(/--[^\n]*/g, "");
const flat = sql.replace(/\s+/g, " ").toLowerCase();

function fn(name: string): { header: string; body: string } {
  const start = new RegExp(`create or replace function public\\.${name}\\s*\\(`, "i").exec(sql);
  expect(start, `${name} not defined in mig 193`).not.toBeNull();
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

describe("mig 193 team editor listing access", () => {
  it("guards the membership helper and returns false with no JWT", () => {
    const helper = fn("is_active_team_member");
    expect(helper.header).toContain("security definer");
    expect(helper.header).toMatch(/set search_path = ''/);
    expect(helper.body).toContain("(select auth.uid()) is not null");
    expect(helper.body).toContain("tm.status = 'active'");
    expect(flat).toContain("revoke all on function public.is_active_team_member(uuid, text[]) from public, anon");
    expect(flat).toContain("grant execute on function public.is_active_team_member(uuid, text[]) to authenticated");
  });

  it("names team_editor on activity_log and does not let an editor insert a log by hand", () => {
    expect(flat).toContain("actor_role in ('contributor', 'admin', 'system', 'team_editor')");
    expect(flat).not.toMatch(/create policy[^;]*activity_log[^;]*for insert/);
    const log = fn("log_team_editor_write");
    expect(log.header).toContain("security definer");
    expect(log.header).toMatch(/set search_path = ''/);
    expect(log.body).toContain("v_uid is null");
    expect(log.body).toContain("auth.uid()");
    expect(flat).toContain("revoke all on function public.log_team_editor_write() from public, anon, authenticated");
  });

  it("does not widen profiles UPDATE and allow-lists the public profile columns only", () => {
    expect(flat).not.toMatch(/create policy[^;]*on public\.profiles/);
    const rpc = fn("update_contributor_public_profile");
    expect(rpc.header).toContain("security definer");
    expect(rpc.header).toMatch(/set search_path = ''/);
    expect(rpc.body).toContain("forbidden_field");
    expect(rpc.body).toContain("public.is_active_team_member(p_contributor_id, array['editor'])");
    for (const col of [
      "bio",
      "website_url",
      "logo_url",
      "gallery_urls",
      "contributor_contact_email",
      "contributor_category",
    ]) {
      expect(rpc.body, col).toContain(`'${col}'`);
    }
    for (const banned of [
      "billing_tier",
      "role",
      "contributor_status",
      "contributor_hidden",
      "contributor_slug",
      "email",
      "deleted_at",
    ]) {
      expect(rpc.body, banned).not.toContain(`'${banned}'`);
    }
    expect(flat).toContain("revoke all on function public.update_contributor_public_profile(uuid, jsonb) from public, anon");
  });

  it("gives viewers a read of events only, and write policies to editors", () => {
    expect(flat).toContain("is_active_team_member(created_by, array['editor', 'viewer'])");
    const writes = flat.match(/for (insert|update|delete) to authenticated/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    const writeChunks = flat.split(/create policy /).slice(1);
    for (const chunk of writeChunks) {
      const head = chunk.slice(0, 400);
      if (/for (insert|update|delete)/.test(head) && /array\['editor', 'viewer'\]/.test(head)) {
        throw new Error("a write policy includes viewers: " + head.slice(0, 180));
      }
    }
    expect(flat).toContain("is_active_team_member(contributor_id, array['editor'])");
  });

  it("restates search_path on the replaced suggestion function", () => {
    const decide = fn("decide_listing_suggestion");
    expect(decide.header).toMatch(/set search_path = ''/);
    expect(decide.header).toContain("security definer");
    expect(decide.body).toContain("team_editor");
    expect(flat).toContain("revoke all on function public.decide_listing_suggestion(uuid, text, uuid) from public, anon");
  });
});
