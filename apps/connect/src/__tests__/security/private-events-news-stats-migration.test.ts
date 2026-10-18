// @vitest-environment node
/**
 * Static twin of migration 192. A real database cannot run in CI, so this pins
 * the promises in the file: private events are not public, news is not a
 * citizen's publishing tool, and public stats neither name a hidden listing
 * nor return an exact follower count. Places and profiles stay publicly readable.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "../..");
const raw = readFileSync(
  join(ROOT, "supabase/migrations/192_private_events_news_and_public_stats.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

const lines = raw.split("\n");
const start = lines.findIndex((l) => l.trim() === "begin;");
const end = lines.findIndex((l, i) => i > start && l.trim() === "commit;");
const body = lines.slice(start + 1, end).join("\n");
const code = body.replace(/--[^\n]*/g, "");
const flat = code.replace(/\s+/g, " ").toLowerCase();

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

describe("migration 192 is one transaction", () => {
  it("begins and commits once, and carries a rollback note", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(raw).toMatch(/-- ── ROLLBACK/);
    expect(raw).toMatch(/NOT APPLIED/);
  });
});

describe("private events are not readable with the public key", () => {
  it("replaces the events SELECT policy so a published row must also be public, unless the caller is the creator, an admin, or an invitee", () => {
    expect(flat).toMatch(/drop policy if exists "published events visible to all, drafts to creator only" on public\.events/);
    expect(flat).toMatch(
      /create policy "published events visible to all, drafts to creator only"\s+on public\.events\s+for select\s+using \(\s*\(\s*visibility = 'public'\s+and status in \('published', 'cancelled'\)\s*\)\s+or created_by = \(select auth\.uid\(\)\)\s+or \(select public\.is_admin\(\)\)\s+or \(\s*visibility = 'private'\s+and status in \('published', 'cancelled'\)\s+and \(select public\.caller_may_read_private_event\(id\)\)\s*\)\s*\)/,
    );
  });

  it("the invitee helper is SECURITY DEFINER, search_path empty, false with no JWT, and covers RSVP plus invited or accepted co-hosts", () => {
    const f = fn("caller_may_read_private_event");
    expect(f.header).toMatch(/security definer/);
    expect(f.header).toMatch(/set search_path = ''/);
    expect(f.header).toMatch(/\bstable\b/);
    expect(f.text).toMatch(/\(select auth\.uid\(\)\) is not null/);
    expect(f.text).toMatch(/from public\.rsvps r/);
    expect(f.text).toMatch(/r\.user_id = \(select auth\.uid\(\)\)/);
    expect(f.text).toMatch(/c\.status in \('invited', 'accepted'\)/);
    expect(f.text).not.toMatch(/'declined'/);
    expect(flat).toMatch(
      /revoke all on function public\.caller_may_read_private_event\(uuid\) from public;/,
    );
    expect(flat).toMatch(
      /grant execute on function public\.caller_may_read_private_event\(uuid\) to anon, authenticated;/,
    );
  });

  it("photos, comments, updates and map bubbles follow the event the caller can see", () => {
    for (const table of ["public.event_updates", "public.event_photos", "public.comments", "public.map_bubbles"]) {
      expect(flat, table).toMatch(new RegExp(`exists \\(\\s*select 1 from public\\.events e\\s+where e\\.id = ${table.split(".")[1]}\\.event_id`));
    }
    expect(flat).toMatch(/user_id = \(select auth\.uid\(\)\)\s+and exists \(\s*select 1 from public\.events e\s+where e\.id = comments\.event_id/);
  });

  it("does not mint a public bubble for a private event, and the bubble reader repeats the rule", () => {
    const bubble = fn("tg_bubble_from_event_update");
    const broadcast = fn("tg_bubble_from_broadcast");
    const reader = fn("get_active_map_bubbles");
    for (const f of [bubble, broadcast, reader]) {
      expect(f.header).toMatch(/security definer/);
      expect(f.header).toMatch(/set search_path = ''/);
      expect(f.text).toMatch(/e\.visibility = 'public'/);
    }
    expect(reader.text).toMatch(/public\.caller_may_read_private_event\(e\.id\)/);
    expect(flat).toMatch(/revoke all on function public\.tg_bubble_from_event_update\(\) from public, anon, authenticated;/);
    expect(flat).toMatch(/grant execute on function public\.get_active_map_bubbles\(\) to anon, authenticated;/);
  });

  it("a stranger cannot RSVP or consider their way into a private event", () => {
    const rsvp = fn("safe_rsvp");
    const consider = fn("toggle_consider");
    for (const f of [rsvp, consider]) {
      expect(f.header).toMatch(/security definer/);
      expect(f.header).toMatch(/set search_path = ''/);
      expect(f.text).toMatch(/auth\.uid\(\) is null or auth\.uid\(\) <> p_user_id/);
      expect(f.text).toMatch(/e\.visibility = 'private'|v_visibility = 'private'/);
      expect(f.text).toMatch(/not public\.caller_may_read_private_event\(p_event_id\)/);
      expect(f.text).toMatch(/'event not found'/);
    }
    expect(rsvp.text).toMatch(/location_snapshot/);
    expect(rsvp.text).toMatch(/v_status <> 'published'/);
    expect(consider.text).toMatch(/status = 'considering'/);
    expect(flat).toMatch(/revoke all on function public\.safe_rsvp\(uuid, uuid\) from public, anon;/);
    expect(flat).toMatch(/grant execute on function public\.safe_rsvp\(uuid, uuid\) to authenticated;/);
    expect(flat).toMatch(/revoke all on function public\.toggle_consider\(uuid, uuid\) from public, anon;/);
    expect(flat).toMatch(/grant execute on function public\.toggle_consider\(uuid, uuid\) to authenticated;/);
    expect(flat).toMatch(
      /create policy "authenticated users can rsvp" on public\.rsvps\s+for insert to authenticated\s+with check \(\s*user_id = \(select auth\.uid\(\)\)\s+and exists \(\s*select 1 from public\.events e\s+where e\.id = rsvps\.event_id\s*\)\s*\)/,
    );
  });
});

describe("news is a public listing, not a citizen's insert", () => {
  it("insert requires the signed-in author to be an approved Contributor or an admin, and not deleted", () => {
    expect(flat).toMatch(
      /create policy "contributors can create own news posts"\s+on public\.news_posts\s+for insert to authenticated\s+with check \(\s*contributor_id = \(select auth\.uid\(\)\)\s+and exists \(\s*select 1\s+from public\.profiles p\s+where p\.id = \(select auth\.uid\(\)\)\s+and p\.deleted_at is null\s+and \(\s*p\.role = 'admin'\s+or \(p\.role = 'contributor' and p\.contributor_status = 'approved'\)\s*\)\s*\)\s*\)/,
    );
  });

  it("public select hides a hidden, unapproved or deleted author's post, and keeps the author's own row", () => {
    expect(flat).toMatch(/contributor_id = \(select auth\.uid\(\)\)/);
    expect(flat).toMatch(/p\.role = 'contributor'/);
    expect(flat).toMatch(/p\.contributor_status = 'approved'/);
    expect(flat).toMatch(/coalesce\(p\.contributor_hidden, false\) = false/);
    expect(flat).toMatch(/p\.deleted_at is null/);
    expect(flat).toMatch(/revoke insert, update, delete, truncate on table public\.news_posts from anon;/);
    expect(flat).not.toMatch(/on public\.news_posts for select\s+using \(true\)/);
  });
});

describe("public stats do not expose a hidden listing or an exact follower count", () => {
  const stats = fn("get_contributor_public_stats");

  it("is SECURITY DEFINER with an empty search_path, and stays callable by the public key", () => {
    expect(stats.header).toMatch(/security definer/);
    expect(stats.header).toMatch(/set search_path = ''/);
    expect(stats.header).toMatch(/\bstable\b/);
    expect(flat).toMatch(/revoke all on function public\.get_contributor_public_stats\(uuid\) from public;/);
    expect(flat).toMatch(/grant execute on function public\.get_contributor_public_stats\(uuid\) to anon, authenticated;/);
  });

  it("returns null for a hidden, unapproved or deleted Contributor", () => {
    expect(stats.text).toMatch(/p_org_id is null/);
    expect(stats.text).toMatch(/v_role is distinct from 'contributor'/);
    expect(stats.text).toMatch(/v_status is distinct from 'approved'/);
    expect(stats.text).toMatch(/coalesce\(v_hidden, false\)/);
    expect(stats.text).toMatch(/v_deleted is not null/);
    expect(stats.text).toMatch(/return null/);
  });

  it("buckets followers through follower_count_public and still counts only public published events", () => {
    expect(stats.text).toMatch(/public\.follower_count_public\(p_org_id\)/);
    expect(stats.text).not.toMatch(/from public\.follows/);
    expect(stats.text).toMatch(/status = 'published' and visibility = 'public'/);
  });
});

describe("places and profiles stay publicly readable", () => {
  it("does not drop or replace a places or profiles policy", () => {
    expect(flat).not.toMatch(/on public\.places/);
    expect(flat).not.toMatch(/on public\.profiles\b/);
    expect(flat).not.toMatch(/drop policy[^;]*profiles/);
    expect(raw.toLowerCase()).toMatch(/reviewed and left alone/);
  });
});
