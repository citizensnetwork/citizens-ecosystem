// @vitest-environment node
/**
 * Convince reader and the "considering" switch (supabase/migrations/191_friends_considering.sql, applied 2026-10-18): the static twin of the rollback-only probe.
 * A real database cannot run in CI, so this pins the promises the migration's own comments make, and that the dry-run probe really
 * ran this file's text (not a copy that drifted). It cannot replace the probes; it keeps the file honest after the apply.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "../..");
const raw = readFileSync(join(ROOT, "supabase/migrations/191_friends_considering.sql"), "utf8").replace(/\r\n/g, "\n");
const probe = readFileSync(join(ROOT, "docs/audit/probes/friends_considering.probe.sql"), "utf8").replace(/\r\n/g, "\n");
const route = readFileSync(join(process.cwd(), "src/app/api/notifications/preferences/route.ts"), "utf8");
const dbTypes = readFileSync(join(process.cwd(), "src/types/db.ts"), "utf8");

/** The part that runs: between the first `begin;` and the `commit;` line, no ROLLBACK block. */
const lines = raw.split("\n");
const start = lines.findIndex((l) => l.trim() === "begin;");
const end = lines.findIndex((l, i) => i > start && l.trim() === "commit;");
const body = lines.slice(start + 1, end).join("\n").replace(/^\n+|\n+$/g, "");
/** The same, with `-- …` comments removed, so a word in a comment never satisfies a check. */
const code = body.replace(/--[^\n]*/g, "");

/** One `create or replace function public.<name>(` up to the end of its dollar-quoted body. */
function fn(name: string): { header: string; text: string } {
  const m = new RegExp(`create or replace function public\\.${name}\\s*\\(`, "i").exec(code);
  expect(m, `${name} not defined`).not.toBeNull();
  const from = m!.index;
  const open = /\$([A-Za-z_]*)\$/.exec(code.slice(from))!;
  const bodyStart = from + open.index + open[0].length;
  const bodyEnd = code.indexOf(open[0], bodyStart);
  const header = code.slice(from, from + open.index).replace(/\s+/g, " ").toLowerCase();
  return { header, text: code.slice(bodyStart, bodyEnd).replace(/\s+/g, " ").toLowerCase() };
}
const flat = code.replace(/\s+/g, " ").toLowerCase();

describe("the migration is one transaction with a way back", () => {
  it("begins and commits once, and carries a ROLLBACK block", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(raw).toMatch(/-- ── ROLLBACK/);
    expect(raw).toMatch(/191_friends_considering/);
  });
  it("is the text the dry run executed: the dry-run probe splices the body in unchanged", () => {
    const a = probe.indexOf("execute $mig$\n");
    const b = probe.indexOf("\n  $mig$;", a);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(probe.slice(a + "execute $mig$\n".length, b)).toBe(body);
  });
});

describe("the reader friends_considering_event", () => {
  const f = fn("friends_considering_event");
  it("is SECURITY DEFINER with a pinned search_path, and STABLE", () => {
    expect(f.header).toMatch(/security definer/);
    expect(f.header).toMatch(/set search_path = pg_catalog, public/);
    expect(f.header).toMatch(/\bstable\b/);
  });
  it("returns exactly id, full_name, avatar_url and nudged, and nothing else", () => {
    expect(f.header).toMatch(/returns table \(id uuid, full_name text, avatar_url text, nudged boolean\)/);
  });
  it("asks the policy's own helper for every row, so the list and the INSERT policy cannot disagree", () => {
    expect(f.text).toMatch(/public\.is_considering_for_friend\(r\.user_id, p_event\)/);
    expect(f.text).toMatch(/r\.status = 'considering'/);
  });
  it("needs a sign-in and a real event, is alphabetical never by popularity, and is capped", () => {
    expect(f.text).toMatch(/auth\.uid\(\) is not null/);
    expect(f.text).toMatch(/p_event is not null/);
    expect(f.text).toMatch(/order by lower\(p\.full_name\), p\.id/);
    expect(f.text).toMatch(/limit 50/);
    expect(f.text).not.toMatch(/count\(|created_at|rank|score|popular/);
  });
  it("never raises: a refusal is an empty list", () => {
    expect(f.text).not.toMatch(/\braise\b/);
  });
  it("is executable by signed-in users and the service role, never by the public key", () => {
    expect(flat).toMatch(/revoke all on function public\.friends_considering_event\(uuid\) from public, anon;/);
    expect(flat).toMatch(/grant execute on function public\.friends_considering_event\(uuid\) to authenticated, service_role;/);
    expect(flat).not.toMatch(/grant [^;]*to [^;]*\banon\b/);
    expect(flat).not.toMatch(/grant [^;]*to [^;]*\bpublic\b/);
  });
});

describe("the switch binds the write path too", () => {
  const h = fn("is_considering_for_friend");
  it("the helper hides a person only when the stored value is exactly the text 'false' (authenticated can write junk there, so no boolean cast)", () => {
    expect(h.text).toMatch(/pr\.notification_prefs->>'share_considering' = 'false'/);
    expect(flat).not.toMatch(/share_considering'\)?\s*::\s*boolean/);
    expect(flat).not.toMatch(/::boolean\)?[^;]{0,40}share_considering/);
  });
  it("keeps every condition of the Convince fix and its hardening", () => {
    expect(h.header).toMatch(/security definer/);
    expect(h.header).toMatch(/set search_path = pg_catalog, public/);
    for (const part of ["auth.uid() is not null", "p_other <> auth.uid()", "public.is_mutual_follow(p_other)", "from public.user_blocks", "pr.deleted_at is not null", "e.status = 'published'", "r.status = 'considering'"]) {
      expect(h.text, part).toContain(part);
    }
    expect(flat).toMatch(/revoke all on function public\.is_considering_for_friend\(uuid, uuid\) from public, anon;/);
    expect(flat).toMatch(/grant execute on function public\.is_considering_for_friend\(uuid, uuid\) to authenticated, service_role;/);
  });
});

describe("the one door that writes the switch", () => {
  const s = fn("update_notification_prefs");
  const keysIn = (text: string) => [...text.matchAll(/['"]([a-z_]+)['"]/g)].map((m) => m[1]);
  const sqlKeys = keysIn(/allowed_keys text\[\] := array\[([^\]]*)\]/.exec(s.text)![1]).sort();
  it("is still SECURITY DEFINER with an EMPTY search_path, boolean values only, unknown keys refused", () => {
    expect(s.header).toMatch(/security definer/);
    expect(s.header).toMatch(/set search_path = ''/);
    expect(s.text).toMatch(/jsonb_typeof\(v\) is distinct from 'boolean'/);
    expect(s.text).toMatch(/unknown preference key/);
    expect(s.text).toMatch(/where id = uid/);
    expect(flat).toMatch(/revoke all on function public\.update_notification_prefs\(jsonb\) from public, anon;/);
    expect(flat).toMatch(/grant execute on function public\.update_notification_prefs\(jsonb\) to authenticated;/);
  });
  it("allows the five old keys plus share_considering, the same six as the API route and the types", () => {
    expect(sqlKeys).toEqual(["announcements", "contributor_updates", "event_reminders", "friends_activity", "share_considering", "weekly_digest"]);
    const routeBlock = /const ALLOWED_PREF_KEYS = \[([\s\S]*?)\] as const;/.exec(route)![1].replace(/\/\/[^\n]*/g, "");
    expect(keysIn(routeBlock).sort()).toEqual(sqlKeys);
    const typeBlock = /export type NotificationPrefKey =([\s\S]*?);/.exec(dbTypes)![1];
    expect([...typeBlock.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort()).toEqual(sqlKeys);
  });
});

describe("the notification text", () => {
  const n = fn("notify_on_convince");
  it("reads a sender with no name as Someone, and is otherwise the Convince-fix body", () => {
    expect(n.text).toContain("coalesce(nullif(btrim(full_name), ''), 'someone')");
    expect(n.text).toContain("sender_name || ' thinks you should go to ' || event_title");
    expect(n.text).toContain("n.type = 'friend_convince'");
    expect(n.text).toContain("n.data->>'from_user_id' = new.from_user_id::text");
    expect(n.header).toMatch(/security definer/);
    expect(n.header).toMatch(/set search_path = pg_catalog, public/);
  });
  it("does not widen who may call the trigger function (no grant, no revoke: create or replace keeps the service_role-only ACL)", () => {
    expect(flat).not.toMatch(/on function public\.notify_on_convince/);
  });
});
