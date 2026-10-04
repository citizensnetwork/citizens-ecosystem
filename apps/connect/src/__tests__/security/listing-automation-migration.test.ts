// @vitest-environment node
/**
 * Listing automation, Phase 1 (mig 181): the static twin of the rollback-only probe.
 * A real database cannot run in CI, so this pins the promises the migration's own
 * comments make: consent is off by default and cannot exist unrecorded, the consent
 * record is private and server-owned, nobody but service_role can create a
 * suggestion, and every SECURITY DEFINER function keeps the hardening that
 * CREATE OR REPLACE FUNCTION would otherwise silently drop (RESUME §3).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "../..", "supabase/migrations/181_listing_automation_phase1.sql");

/** The migration with `-- …` comments removed, so a word in a comment never satisfies a check. */
const sql = readFileSync(FILE, "utf8").replace(/--[^\n]*/g, "");
const flat = sql.replace(/\s+/g, " ").toLowerCase();

/** The text of `create or replace function public.<name>(` up to its closing dollar-quote. */
function fn(name: string): { header: string; body: string } {
  const start = new RegExp(`create or replace function public\\.${name}\\s*\\(`, "i").exec(sql);
  expect(start, `${name} not defined in mig 181`).not.toBeNull();
  const from = start!.index;
  const open = /\$([A-Za-z_]*)\$/.exec(sql.slice(from))!;
  const tag = open[0];
  const bodyStart = from + open.index + tag.length;
  const bodyEnd = sql.indexOf(tag, bodyStart);
  return { header: sql.slice(from, from + open.index).replace(/\s+/g, " ").toLowerCase(), body: sql.slice(bodyStart, bodyEnd).replace(/\s+/g, " ").toLowerCase() };
}

describe("mig 181: consent record on profiles", () => {
  it("defaults to OFF and only allows the three levels", () => {
    expect(flat).toMatch(/add column if not exists auto_update_level text not null default 'off'/);
    expect(flat).toMatch(/check \(auto_update_level in \('off', 'suggest', 'events_auto'\)\)/);
  });
  it("cannot be on without a recorded time AND source", () => {
    expect(flat).toMatch(
      /profiles_auto_update_consent_recorded check \(auto_update_level = 'off' or \(auto_update_consent_at is not null and auto_update_consent_source is not null\)\)/,
    );
  });
  it("the guard is SECURITY INVOKER with search_path '', polices all three columns, lets admins and the server through", () => {
    const g = fn("guard_profile_automation_columns");
    expect(g.header).toContain("security invoker");
    expect(g.header).toMatch(/set search_path = ''/);
    expect(g.body).toContain("current_user not in ('anon', 'authenticated')");
    expect(g.body).toContain("public.is_admin()");
    for (const col of ["auto_update_level", "auto_update_consent_at", "auto_update_consent_source", "auto_update_nudged_at"]) {
      expect(g.body, col).toContain(`new.${col} is distinct from old.${col}`);
    }
    expect(flat).toContain("revoke all on function public.guard_profile_automation_columns() from public, anon, authenticated");
    expect(flat).toMatch(/create trigger trg_guard_profile_automation_columns before update on public\.profiles for each row/);
  });
  it("leaves guard_profile_server_columns (mig 175) alone", () => {
    expect(flat).not.toMatch(/create or replace function public\.guard_profile_server_columns/);
  });
  it("is NOT added to any public grant (private columns)", () => {
    expect(flat).not.toMatch(/grant select \([^)]*auto_update/);
    expect(flat).not.toMatch(/grant [a-z, ()_]*on (table )?public\.profiles/);
  });
});

describe("mig 181: listing_sources", () => {
  it("has RLS on, no anon access, and gives the owner only read / add / remove plus update(enabled)", () => {
    expect(flat).toContain("alter table public.listing_sources enable row level security");
    expect(flat).toContain("revoke all on table public.listing_sources from public, anon");
    expect(flat).toContain("revoke all on table public.listing_sources from authenticated");
    expect(flat).toContain("grant select, insert, delete on table public.listing_sources to authenticated");
    expect(flat).toContain("grant update (enabled) on table public.listing_sources to authenticated");
    expect(flat).not.toMatch(/grant [a-z, ]*update[a-z, ]* on table public\.listing_sources to authenticated/);
  });
  it("one policy per command, all keyed on (select auth.uid())", () => {
    const policies = flat.match(/create policy listing_sources_[a-z]+/g) ?? [];
    expect(policies.sort()).toEqual([
      "create policy listing_sources_delete",
      "create policy listing_sources_insert",
      "create policy listing_sources_select",
      "create policy listing_sources_update",
    ]);
    expect(flat).not.toMatch(/ auth\.uid\(\) =/);
    expect(flat).toContain("contributor_id = (select auth.uid())");
  });
  it("insert is for an approved Contributor's own rows only", () => {
    expect(flat).toMatch(/listing_sources_insert on public\.listing_sources for insert to authenticated with check \( contributor_id = \(select auth\.uid\(\)\) and exists/);
    expect(flat).toContain("p.role = 'contributor' and p.contributor_status = 'approved'");
  });
  it("only https links, unique per Contributor, capped, and Facebook / Instagram / TikTok can never be enabled", () => {
    expect(flat).toContain("url ~ '^https://'");
    expect(flat).toContain("unique (contributor_id, kind, url)");
    expect(flat).toMatch(/check \(kind in \('website', 'youtube', 'calendar'\) or enabled = false\)/);
    expect(flat).toMatch(/>= 12 then raise exception 'too_many_sources'/);
  });
});

describe("mig 181: listing_suggestions", () => {
  it("has RLS on, no anon access, and the owner can only SELECT (no direct insert or update)", () => {
    expect(flat).toContain("alter table public.listing_suggestions enable row level security");
    expect(flat).toContain("revoke all on table public.listing_suggestions from public, anon");
    expect(flat).toContain("revoke all on table public.listing_suggestions from authenticated");
    expect(flat).toContain("grant select on table public.listing_suggestions to authenticated");
    expect(flat).not.toMatch(/grant [a-z, ()]*(insert|update|delete)[a-z, ()]* on table public\.listing_suggestions/);
    expect(flat).toContain("grant all on table public.listing_suggestions to service_role");
  });
  it("has exactly one policy: select, own rows or admin", () => {
    expect(flat.match(/create policy listing_suggestions_[a-z]+/g)).toEqual(["create policy listing_suggestions_select"]);
    expect(flat).toMatch(/listing_suggestions_select on public\.listing_suggestions for select to authenticated using \(contributor_id = \(select auth\.uid\(\)\) or public\.is_admin\(\)\)/);
  });
  it("dedupes across days and only allows the known kinds and statuses", () => {
    expect(flat).toContain("unique (contributor_id, fingerprint)");
    expect(flat).toContain("check (kind in ('event', 'news', 'profile'))");
    expect(flat).toContain("check (status in ('pending', 'published', 'auto_published', 'dismissed', 'superseded'))");
    expect(flat).toContain("fingerprint text not null check (length(fingerprint) = 64)");
  });
  it("indexes the inbox query and the foreign keys", () => {
    expect(flat).toContain("on public.listing_suggestions (contributor_id, status, created_at desc)");
    expect(flat).toContain("on public.listing_suggestions (source_id)");
    expect(flat).toContain("on public.listing_suggestions (decided_by)");
  });
});

describe("mig 181: losing the listing clears automation", () => {
  it("resets the level and deletes sources and suggestions when the role stops being 'contributor'", () => {
    const r = fn("reset_automation_on_listing_loss");
    expect(r.header).toContain("security definer");
    expect(r.header).toMatch(/set search_path to ''/);
    expect(r.body).toContain("old.role = 'contributor' and new.role is distinct from 'contributor'");
    expect(r.body).toContain("new.auto_update_level := 'off'");
    expect(r.body).toContain("new.auto_update_nudged_at := null");
    expect(r.body).toContain("delete from public.listing_suggestions where contributor_id = new.id");
    expect(r.body).toContain("delete from public.listing_sources where contributor_id = new.id");
    expect(flat).toMatch(/trg_profiles_reset_automation before update of role on public\.profiles/);
    expect(flat).toContain("revoke all on function public.reset_automation_on_listing_loss() from public, anon, authenticated");
  });
});

describe("mig 181: the owner's three functions", () => {
  const names = [
    ["get_my_automation_settings", "()"],
    ["set_my_automation_level", "(text)"],
    ["decide_listing_suggestion", "(uuid, text, uuid)"],
  ] as const;

  for (const [name, sig] of names) {
    it(`${name} is SECURITY DEFINER, search_path '', null-uid guarded, revoked from public/anon, granted to authenticated only`, () => {
      const f = fn(name);
      expect(f.header).toContain("security definer");
      expect(f.header).toMatch(/set search_path to ''/);
      expect(f.body).toMatch(/if v_uid is null then return jsonb_build_object\('success', false, 'reason', 'not_signed_in'\)/);
      expect(flat).toContain(`revoke all on function public.${name}${sig} from public, anon`);
      expect(flat).toContain(`grant execute on function public.${name}${sig} to authenticated`);
      expect(flat).not.toContain(`grant execute on function public.${name}${sig} to anon`);
    });
  }

  it("set_my_automation_level stamps the consent server-side, requires an approved Contributor, and 'off' withdraws instantly", () => {
    const f = fn("set_my_automation_level");
    expect(f.body).toContain("auto_update_consent_at = now()");
    expect(f.body).toContain("auto_update_consent_source = 'dashboard'");
    expect(f.body).toContain("v_row.role is distinct from 'contributor' or v_row.contributor_status is distinct from 'approved'");
    expect(f.body).toContain("update public.listing_sources set enabled = false where contributor_id = v_uid and enabled");
    expect(f.body).toMatch(/update public\.listing_suggestions set status = 'dismissed'.*where contributor_id = v_uid and status = 'pending'/);
    // moving off -> on only switches READABLE sources on
    expect(f.body).toContain("kind in ('website', 'youtube', 'calendar')");
  });

  it("decide_listing_suggestion is owner-scoped, verifies the ref is the caller's, and only auto-published events can be unpublished", () => {
    const f = fn("decide_listing_suggestion");
    expect(f.body).toContain("where id = _id and contributor_id = v_uid for update");
    expect(f.body).toContain("created_by = v_uid");
    expect(f.body).toContain("contributor_id = v_uid)");
    expect(f.body).toContain("v_s.status <> 'auto_published' or v_s.kind <> 'event'");
    expect(f.body).toMatch(/update public\.events set status = 'cancelled' where id = v_s\.published_ref and created_by = v_uid/);
    // dismissing or publishing is only for a PENDING suggestion
    expect(f.body.match(/v_s\.status <> 'pending'/g)?.length).toBe(2);
  });
});

describe("mig 181: events.source_url", () => {
  it("is nullable, https only, length-bounded", () => {
    expect(flat).toContain("alter table public.events add column if not exists source_url text");
    expect(flat).toContain("check (source_url is null or (source_url ~ '^https://' and length(source_url) <= 500))");
  });
});
