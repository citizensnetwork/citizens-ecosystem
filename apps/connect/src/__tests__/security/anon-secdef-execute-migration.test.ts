/**
 * Static twin of docs/audit/probes/200_lock_anon_secdef_execute.probe.sql.
 * CI has no database. This pins the grants and the caller guards in the file.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "../..");
const sql = readFileSync(join(ROOT, "supabase/migrations/200_lock_anon_secdef_execute.sql"), "utf8").replace(
  /--[^\n]*/g,
  "",
);
const flat = sql.replace(/\s+/g, " ").toLowerCase();
const probe = readFileSync(join(ROOT, "docs/audit/probes/200_lock_anon_secdef_execute.probe.sql"), "utf8").toLowerCase();

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

const KEPT = [
  "caller_may_read_private_event",
  "follower_count_public",
  "get_active_map_bubbles",
  "get_community_ideas",
  "get_contributor_public_stats",
  "get_public_contributor_analytics",
  "get_search_autocomplete",
  "get_concept_proposal_tags",
];

describe("mig 200 anon security-definer lockdown", () => {
  it("does not take anon execute away from a logged-out public read", () => {
    for (const name of KEPT) {
      expect(flat, name).not.toContain(`revoke all on function public.${name}`);
      expect(flat, name).not.toContain(`revoke execute on function public.${name}`);
      expect(flat, name).not.toContain(`revoke all on function wear.${name}`);
    }
  });

  it("keeps is_admin executable by anon, with an explicit null arm and an empty search_path", () => {
    const f = fn("is_admin");
    expect(f.header).toContain("security definer");
    expect(f.header).toMatch(/set search_path to ''/);
    expect(f.body).toContain("auth.uid()) is not null");
    expect(flat).toContain("revoke all on function public.is_admin() from public");
    expect(flat).toContain("grant execute on function public.is_admin() to anon, authenticated, service_role");
    expect(flat).not.toContain("revoke all on function public.is_admin() from public, anon");
  });

  it("locks resolve_api_key to service_role and refuses every other caller", () => {
    const f = fn("resolve_api_key");
    expect(f.header).toContain("security definer");
    expect(f.header).toMatch(/set search_path to ''/);
    expect(f.body).toContain("auth.uid() is not null or coalesce(auth.role(), '') <> 'service_role'");
    expect(flat).toContain("revoke all on function public.resolve_api_key(text) from public, anon, authenticated");
    expect(flat).toContain("grant execute on function public.resolve_api_key(text) to service_role");
    expect(flat).not.toMatch(/grant execute on function public\.resolve_api_key\(text\) to [^;]*\banon\b/);
    expect(flat).not.toMatch(/grant execute on function public\.resolve_api_key\(text\) to [^;]*\bauthenticated\b/);
  });

  it("locks is_conversation_participant against anon and against another person's uid", () => {
    const f = fn("is_conversation_participant");
    expect(f.header).toContain("security definer");
    expect(f.header).toMatch(/set search_path to ''/);
    expect(f.body).toContain("auth.uid() is null or uid is distinct from auth.uid()");
    expect(f.body).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(flat).toContain(
      "revoke all on function public.is_conversation_participant(uuid, uuid) from public, anon",
    );
    expect(flat).toContain(
      "grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated, service_role",
    );
    expect(flat).not.toMatch(
      /grant execute on function public\.is_conversation_participant\(uuid, uuid\) to [^;]*\banon\b/,
    );
    for (const policy of [
      'alter policy "participants can view conversations" on public.conversations to authenticated',
      'alter policy "users see participants of their conversations" on public.conversation_participants to authenticated',
      'alter policy "participants can view messages" on public.messages to authenticated',
      'alter policy "participants can send messages" on public.messages to authenticated',
    ]) {
      expect(flat).toContain(policy);
    }
  });

  it("removes client execute from trending_events and get_public_team", () => {
    expect(flat).toContain(
      "revoke all on function public.trending_events(integer) from public, anon, authenticated, service_role",
    );
    expect(flat).toContain(
      "revoke all on function public.get_public_team(uuid) from public, anon, authenticated, service_role",
    );
    expect(flat).not.toMatch(/grant execute on function public\.trending_events/);
    expect(flat).not.toMatch(/grant execute on function public\.get_public_team/);
  });

  it("ships a rollback-only probe that names the locked functions", () => {
    expect(probe).toContain("raise exception");
    for (const name of ["resolve_api_key", "is_conversation_participant", "trending_events", "get_public_team"]) {
      expect(probe, name).toContain(name);
    }
    expect(probe).toContain("anon still executes the nine public functions");
  });
});
