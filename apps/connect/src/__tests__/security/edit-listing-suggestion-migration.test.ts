// @vitest-environment node
/**
 * Mig 198 (edit a waiting listing suggestion): the static twin of its rollback-only probe
 * (docs/audit/probes/198_edit_listing_suggestion.probe.sql). A real database cannot run in CI, so this
 * pins the promises the migration's own comments make: one SECURITY DEFINER function, hardened the way
 * migs 165/166/181/193 taught us, that changes ONLY the payload of a PENDING suggestion for its owner or
 * an active editor, and gives the table no new privilege.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "../..", "supabase/migrations/198_edit_listing_suggestion.sql");

/** The migration with `-- …` comments removed, so a word in a comment never satisfies a check. */
const sql = readFileSync(FILE, "utf8").replace(/--[^\n]*/g, "");
const flat = sql.replace(/\s+/g, " ").toLowerCase().trim();

const start = /create or replace function public\.edit_listing_suggestion\s*\(/i.exec(sql);
const open = /\$([A-Za-z_]*)\$/.exec(sql.slice(start!.index))!;
const tag = open[0];
const bodyStart = start!.index + open.index + tag.length;
const header = sql.slice(start!.index, start!.index + open.index).replace(/\s+/g, " ").toLowerCase().trim();
const body = sql.slice(bodyStart, sql.indexOf(tag, bodyStart)).replace(/\s+/g, " ").toLowerCase().trim();

describe("mig 198: edit_listing_suggestion", () => {
  it("is one function, SECURITY DEFINER with an empty search_path, and CREATE OR REPLACE restates both", () => {
    expect(flat.match(/create or replace function/g)).toHaveLength(1);
    expect(header).toContain("(_id uuid, _payload jsonb)");
    expect(header).toContain("security definer");
    expect(header).toMatch(/set search_path = ''/);
  });

  it("refuses a missing JWT before anything else", () => {
    expect(body).toMatch(/^declare .* begin if v_uid is null then return jsonb_build_object\('success', false, 'reason', 'not_signed_in'\)/);
    expect(body).toContain("v_uid uuid := auth.uid()");
  });

  it("EXECUTE is for signed-in users only", () => {
    expect(flat).toContain("revoke all on function public.edit_listing_suggestion(uuid, jsonb) from public, anon");
    expect(flat).toContain("grant execute on function public.edit_listing_suggestion(uuid, jsonb) to authenticated");
    expect(flat).not.toMatch(/grant execute on function public\.edit_listing_suggestion\(uuid, jsonb\) to (anon|public)/);
  });

  it("allows the owner or an active EDITOR of that listing, and answers everyone else not_found", () => {
    expect(body).toContain("v_s.contributor_id = v_uid");
    expect(body).toContain("public.is_active_team_member(v_s.contributor_id, array['editor'])");
    expect(body).not.toContain("array['viewer']");
    expect(body).toMatch(/else return jsonb_build_object\('success', false, 'reason', 'not_found'\)/);
  });

  it("takes the row lock first, and only a PENDING suggestion can change", () => {
    expect(body).toMatch(/from public\.listing_suggestions where id = _id for update/);
    expect(body).toContain("if v_s.status <> 'pending' then return jsonb_build_object('success', false, 'reason', 'not_pending')");
    expect(body.indexOf("for update")).toBeLessThan(body.indexOf("update public.listing_suggestions set payload"));
    expect(body.indexOf("not_pending")).toBeLessThan(body.indexOf("update public.listing_suggestions set payload"));
  });

  it("changes ONE column, payload: never the fingerprint (the Reader's 'already known'), kind, status, source or timestamps", () => {
    const updates = body.match(/update public\.listing_suggestions set [^;]*;/g) ?? [];
    expect(updates).toEqual(["update public.listing_suggestions set payload = _payload where id = _id;"]);
    for (const col of ["fingerprint", "status", "kind", "source_url", "decided_at", "decided_by", "contributor_id", "published_ref"]) {
      expect(updates.join(" "), col).not.toContain(col);
    }
  });

  it("holds the payload to what the table already holds: a JSON object of at most 16 KB", () => {
    expect(body).toContain("jsonb_typeof(_payload) <> 'object'");
    expect(body).toContain("pg_column_size(_payload) > 16384");
    expect(body).toContain("'reason', 'invalid_payload'");
  });

  it("does not copy the content rules into SQL (they live once, in validateSuggestion)", () => {
    for (const word of ["scrub", "[removed]", "https://", "regexp", "~ '", "like '"]) expect(body, word).not.toContain(word);
  });

  it("logs an editor's edit to activity_log, like the editor branch of decide_listing_suggestion", () => {
    expect(body).toMatch(/if v_editor then insert into public\.activity_log \( contributor_id, actor_id, actor_role, action, entity_type, entity_id, metadata \)/);
    expect(body).toContain("'team_editor', 'edit_suggestion', 'listing_suggestion'");
  });

  it("gives the TABLE no new privilege or policy: still read-only for signed-in users", () => {
    expect(flat).not.toMatch(/(grant|revoke) [a-z, ()]+ on table public\.listing_suggestions/);
    expect(flat).not.toContain("create policy");
    expect(flat).not.toContain("alter table");
    expect(flat).not.toContain("service_role");
  });

  it("runs in one transaction and carries a comment saying why EXECUTE is granted", () => {
    expect(flat.startsWith("begin;")).toBe(true);
    expect(flat.trimEnd().endsWith("commit;")).toBe(true);
    expect(flat).toMatch(/comment on function public\.edit_listing_suggestion\(uuid, jsonb\) is '.*authenticated execute is by design/);
  });
});
