// @vitest-environment node
/**
 * Serving areas (supabase/migrations/195_service_areas.sql, NOT APPLIED until the founder says yes): the static twin of the
 * rollback-only probe. A real database cannot run in CI, so this pins the promises the migration's own comments make, and
 * that the probe still tests the founder's rule. The SQL was also executed on a scratch Postgres (PGlite) with the probe:
 * 64 of 64 PASS, 14 of 14 mutations killed (see the PR). This test keeps the file honest after the apply.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "../..");
const raw = readFileSync(join(ROOT, "supabase/migrations/195_service_areas.sql"), "utf8").replace(/\r\n/g, "\n");
const probe = readFileSync(join(ROOT, "docs/audit/probes/195_service_areas.probe.sql"), "utf8").replace(/\r\n/g, "\n");
const fix = readFileSync(join(ROOT, "supabase/migrations/197_service_areas_anon_read.sql"), "utf8").replace(/\r\n/g, "\n");
const fixLines = fix.split("\n");
const fixCode = fixLines
  .slice(fixLines.findIndex((l) => l.trim() === "begin;") + 1, fixLines.findIndex((l) => l.trim() === "commit;"))
  .join("\n")
  .replace(/--[^\n]*/g, "");
const fixFlat = fixCode.replace(/\s+/g, " ").toLowerCase();

const lines = raw.split("\n");
const start = lines.findIndex((l) => l.trim() === "begin;");
const end = lines.findIndex((l, i) => i > start && l.trim() === "commit;");
const code = lines.slice(start + 1, end).join("\n").replace(/--[^\n]*/g, "");
const flat = code.replace(/\s+/g, " ").toLowerCase();

/** One `create function public.<name>(` up to the end of its dollar-quoted body. */
function fn(name: string): { header: string; text: string } {
  const m = new RegExp(`create function public\\.${name}\\s*\\(`, "i").exec(code);
  expect(m, `${name} not defined`).not.toBeNull();
  const from = m!.index;
  const open = /\$([A-Za-z_]*)\$/.exec(code.slice(from))!;
  const bodyStart = from + open.index + open[0].length;
  const bodyEnd = code.indexOf(open[0], bodyStart);
  return {
    header: code.slice(from, from + open.index).replace(/\s+/g, " ").toLowerCase(),
    text: code.slice(bodyStart, bodyEnd).replace(/\s+/g, " ").toLowerCase(),
  };
}

describe("the migration is one transaction with a way back", () => {
  it("begins and commits once and says it is not applied, with a rollback", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(raw).toMatch(/NOT APPLIED/);
    expect(raw).toMatch(/-- Rollback/);
    expect(raw).toMatch(/drop table public\.service_areas;/);
  });
  it("touches no existing table: it alters nothing and re-creates nothing", () => {
    expect(flat).not.toMatch(/alter table public\.(profiles|events|places|contributor_applications|notifications)/);
    expect(flat).not.toMatch(/create or replace/);
    expect(flat).not.toMatch(/drop (table|function|policy|constraint)/);
  });
});

describe("the three tables", () => {
  const tables = ["service_areas", "contributor_service_areas", "contributor_service_radius", "contributor_service_presence"];
  it.each(tables)("%s has RLS on, takes every privilege away, and gives back SELECT only", (t) => {
    expect(flat).toContain(`alter table public.${t} enable row level security`);
    expect(flat).toContain(`revoke all on public.${t} from anon, authenticated, public`);
    expect(flat).toMatch(new RegExp(`grant select on public\\.${t} to anon, authenticated`));
    expect(flat).not.toMatch(new RegExp(`grant (insert|update|delete|truncate|all)[^;]* on public\\.${t}`));
    expect(flat).not.toMatch(new RegExp(`create policy \\w+ on public\\.${t}\\s+for (insert|update|delete|all)`));
  });
  it("the link tables are public only for a live listing (the approval wall), plus the owner, team and admin", () => {
    for (const t of ["contributor_service_areas", "contributor_service_radius", "contributor_service_presence"]) {
      const i = flat.indexOf(`create policy ${t}_select`);
      expect(i).toBeGreaterThan(0);
      const policy = flat.slice(i, flat.indexOf(";", i));
      expect(policy).toMatch(/p\.role = 'contributor' and p\.contributor_status = 'approved'/);
      expect(policy).toMatch(/coalesce\(p\.contributor_hidden, false\) = false and p\.deleted_at is null/);
      expect(policy).toMatch(/contributor_id = \(select auth\.uid\(\)\)/);
      expect(policy).toMatch(/is_active_team_member\(contributor_id, array\['editor', 'viewer'\]\)/);
      expect(policy).toMatch(/\(select public\.is_admin\(\)\)/);
    }
  });
  it("the radius is capped at 100 km in the table itself and a level can only sit under the right parent", () => {
    expect(flat).toMatch(/radius_km\s+integer not null check \(radius_km between 1 and 100\)/);
    expect(flat).toMatch(/check \(\(level = 'province'\) = \(parent_id is null\)\)/);
    expect(flat).toMatch(/new\.level = 'place' and v_parent_level is distinct from 'province'/);
    expect(flat).toMatch(/new\.level = 'suburb' and v_parent_level is distinct from 'place'/);
  });
  it("the tag is one of two plain values and defaults to online", () => {
    expect(flat).toMatch(/presence\s+text not null default 'online' check \(presence in \('online', 'no_fixed_place'\)\)/);
  });
  it("carries no contact column anywhere", () => {
    expect(flat).not.toMatch(/email|phone|whatsapp|address/);
  });
});

describe("set_service_areas, the only write path", () => {
  const f = fn("set_service_areas");
  it("is SECURITY DEFINER with an empty search_path", () => {
    expect(f.header).toMatch(/security definer/);
    expect(f.header).toMatch(/set search_path = ''/);
  });
  it("refuses a missing JWT first, then anyone who is not the Contributor, an active editor or an admin", () => {
    expect(f.text).toMatch(/if v_uid is null then return jsonb_build_object\('success', false, 'reason', 'not_authenticated'\)/);
    expect(f.text).toMatch(/v_uid = p_contributor_id or public\.is_active_team_member\(p_contributor_id, array\['editor'\]\) or \(select public\.is_admin\(\)\)/);
    expect(f.text.indexOf("not_authenticated")).toBeLessThan(f.text.indexOf("not_allowed"));
    expect(f.text.indexOf("not_allowed")).toBeLessThan(f.text.indexOf("delete from public.contributor_service_areas"));
  });
  it("only an approved Contributor or a pending applicant can choose areas", () => {
    expect(f.text).toMatch(/\(v_role = 'contributor' and v_status = 'approved'\) or v_status = 'pending'/);
  });
  it("never adds an area the caller did not name: no parent is looked up, no tick travels upward", () => {
    expect(f.text).not.toMatch(/parent_id/);
  });
  it("a radius needs a centre: a ticked area or a pin, and is capped", () => {
    expect(f.text).toMatch(/p_radius_km < 1 or p_radius_km > 100/);
    expect(f.text).toMatch(/'centre_not_ticked'/);
    expect(f.text).toMatch(/'radius_needs_centre'/);
  });
  it("refuses an unknown or null tag, and clears the tag with the selection", () => {
    expect(f.text).toMatch(/p_presence is null or p_presence not in \('online', 'no_fixed_place'\)/);
    expect(f.text).toMatch(/'invalid_presence'/);
    expect(f.text).toMatch(/cardinality\(v_ids\) = 0 and p_radius_km is null then delete from public\.contributor_service_presence/);
  });
  it("is executable by signed-in users only", () => {
    expect(flat).toMatch(/revoke all on function public\.set_service_areas\(uuid, uuid\[\], integer, uuid, text\) from public, anon/);
    expect(flat).toMatch(/grant execute on function public\.set_service_areas\(uuid, uuid\[\], integer, uuid, text\) to authenticated;/);
  });
});

describe("serving_area_listings, the public read", () => {
  const f = fn("serving_area_listings");
  it("is SECURITY INVOKER (runs under the caller's RLS), STABLE, with an empty search_path", () => {
    expect(f.header).toMatch(/security invoker/);
    expect(f.header).not.toMatch(/security definer/);
    expect(f.header).toMatch(/\bstable\b/);
    expect(f.header).toMatch(/set search_path = ''/);
  });
  it("returns the tag, and none for someone with a pin (they are on the map)", () => {
    expect(f.header).toMatch(/presence text \)/);
    expect(f.text).toMatch(/case when x\.has_pin then null else x\.presence end/);
  });
  it("returns no contact or coordinate column", () => {
    const returns = f.header.slice(f.header.indexOf("returns table"));
    expect(returns).not.toMatch(/email|phone|whatsapp|address|latitude|longitude|physical/);
  });
  it("walks UP from the viewed area only, so a tick never means the areas inside it matching a wider view", () => {
    expect(f.text).toMatch(/join chain c on a\.id = c\.parent_id/);
    expect(f.text).not.toMatch(/a\.parent_id = c\.id/);
  });
  it("re-applies the approval wall and the no-pin rule for the main list", () => {
    expect(f.text).toMatch(/p\.role = 'contributor' and p\.contributor_status = 'approved' and coalesce\(p\.contributor_hidden, false\) = false and p\.deleted_at is null/);
    expect(f.text).toMatch(/where not l\.has_pin/);
  });
  it("orders 'also served by' by distance, then name, and clamps the cap; nothing is by popularity", () => {
    expect(f.text).toMatch(/order by x\.d, x\.full_name, x\.id limit greatest\(0, least\(coalesce\(p_also_limit, 5\), 20\)\)/);
    expect(f.text).not.toMatch(/follow|prominence|popular|score/);
  });
  it("is executable by anon and signed-in users, and by no one else", () => {
    expect(flat).toMatch(/revoke all on function public\.serving_area_listings\(uuid, integer\) from public;/);
    expect(flat).toMatch(/grant execute on function public\.serving_area_listings\(uuid, integer\) to anon, authenticated;/);
  });
});

describe("197, the fix: the public (anon) read policies never touch the team helper", () => {
  const tables = ["contributor_service_areas", "contributor_service_radius", "contributor_service_presence"];
  /** One `create policy <name> on public.<t> ... ;` as flattened lower-case text. */
  const policy = (name: string) => {
    const i = fixFlat.indexOf(`create policy ${name} `);
    expect(i, `${name} missing`).toBeGreaterThanOrEqual(0);
    return fixFlat.slice(i, fixFlat.indexOf(");", i) + 2);
  };
  it("says it is not applied and what it fixes", () => {
    expect(fix).toMatch(/NOT APPLIED/);
    expect(fix).toMatch(/permission denied for function is_active_team_member/);
    expect(fix).toMatch(/-- Rollback/);
  });
  it.each(tables)("%s: the single policy is dropped and replaced by one per role", (t) => {
    expect(fixFlat).toContain(`drop policy ${t}_select on public.${t}`);
    expect(fixFlat).toContain(`create policy ${t}_select_public on public.${t} for select to anon using (`);
    expect(fixFlat).toContain(`create policy ${t}_select_signed_in on public.${t} for select to authenticated using (`);
  });
  it.each(tables)("%s: the anon policy is the approval wall only (no helper, no auth.uid, no admin)", (t) => {
    const p = policy(`${t}_select_public`);
    expect(p).toMatch(/p\.role = 'contributor' and p\.contributor_status = 'approved'/);
    expect(p).toMatch(/coalesce\(p\.contributor_hidden, false\) = false and p\.deleted_at is null/);
    expect(p).not.toMatch(/is_active_team_member|auth\.uid|is_admin/);
    // the wall is the whole condition: nothing is OR-ed in front of it
    expect(p).toMatch(/to anon using \( exists \(/);
    expect(p).not.toMatch(/\bor\b/);
  });
  it.each(tables)("%s: the signed-in policy keeps every arm (live listing, own row, team member, admin)", (t) => {
    const p = policy(`${t}_select_signed_in`);
    expect(p).toMatch(/p\.contributor_status = 'approved'/);
    expect(p).toMatch(/contributor_id = \(select auth\.uid\(\)\)/);
    expect(p).toMatch(/is_active_team_member\(contributor_id, array\['editor', 'viewer'\]\)/);
    expect(p).toMatch(/\(select public\.is_admin\(\)\)/);
  });
  it("changes nothing else: no table, grant, function or data", () => {
    expect(fixFlat).not.toMatch(/create table|alter table|grant |revoke |create function|create or replace|insert into|delete from|update /);
  });
});

describe("the trigger function", () => {
  it("is executable by no client", () => {
    expect(flat).toMatch(/revoke all on function public\.service_areas_check_parent\(\) from public, anon, authenticated/);
  });
});

describe("the seed", () => {
  it("has the nine provinces and uses no third-party data", () => {
    const provinces = flat.match(/\('province', '[a-z\- ]+', '[a-z\-]+', -?\d/g) ?? [];
    expect(provinces).toHaveLength(9);
    expect(raw).toMatch(/taken from no third-party dataset/);
  });
});

describe("the probe", () => {
  it("is rollback-only, synthetic-only, and tests the founder's rule", () => {
    expect(probe).toMatch(/raise exception E'PROBE 195 RESULTS \(rolled back\)/);
    expect(probe).not.toMatch(/@(?!probe\.example)[a-z0-9.-]+\.[a-z]+/i);
    for (const rule of [
      "never upward",
      "a tick never propagates upward",
      "ancestor",
      "a Contributor with a pin is never in the main",
      "a hidden Contributor is never listed",
      "a pending applicant is never listed",
      "needs a centre",
      "nearest first",
      "direct insert into contributor_service_areas is refused",
      "TRUNCATE is refused",
      "a pinned Contributor''s Also served by row carries no Online tag",
      "a pending applicant can read back their own areas",
      "a signed-in stranger cannot read a pending applicant''s areas",
      "a main row carries the chosen No fixed place tag",
    ]) {
      expect(probe, `probe lost the check for: ${rule}`).toContain(rule);
    }
  });
});
