/**
 * Migration 202 is a proposal. It is not applied here. These checks pin the
 * Let's cap, the category lock, the empty search_path, and the anon revoke
 * so a later edit cannot quietly drop them. 201 stays free for issue #314.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { missingLetsColumn } from "@/lib/events/letsColumn";

const root = join(process.cwd(), "..", "..");
const sql = readFileSync(join(root, "supabase/migrations/202_lets_gatherings.sql"), "utf8");
const lib = readFileSync(join(process.cwd(), "src/frontend/app/lets-lib.jsx"), "utf8");

function starterIds(source: string): string[] {
  return [...source.matchAll(/'(evangelise|run|pray|worship|social|clean-up|coffee|flashmob)'/g)].map((m) => m[1]);
}

describe("migration 202 (not applied)", () => {
  it("is 202, and 201 is not taken by this change", () => {
    expect(existsSync(join(root, "supabase/migrations/202_lets_gatherings.sql"))).toBe(true);
    expect(existsSync(join(root, "supabase/migrations/201_open_to_collaborate.sql"))).toBe(false);
    expect(sql).toMatch(/NOT APPLIED/);
    expect(sql).toMatch(/Do not apply/);
  });

  it("caps Let's rows at four, keeps the ordinary cap, and uses the same starter ids as the app", () => {
    expect(sql).toMatch(/v_lets_cap int := 4/);
    expect(sql).toMatch(/lets_event_rate_limited/);
    expect(sql).toMatch(/e\.lets_starter is not null/);
    expect(sql).toMatch(/e\.lets_starter is null/);
    expect(sql).toMatch(/v_role is distinct from 'citizen'/);
    expect(sql).not.toMatch(/coalesce\(new\.community_contributor, false\) = false/);
    expect(sql).toMatch(/community_event_rate_limited/);
    expect(sql).not.toMatch(/Let's gatherings are exempt/);
    const fromSql = [...sql.matchAll(/'(evangelise|run|pray|worship|social|clean-up|coffee|flashmob)'/g)].map((m) => m[1]);
    const fromLib = starterIds(lib);
    expect(fromSql).toEqual(fromLib);
    expect(new Set(fromSql).size).toBe(8);
  });

  it("rejects a category change and a marker change on a Let's row for a non-admin", () => {
    expect(sql).toMatch(/new\.category is distinct from old\.category/);
    expect(sql).toMatch(/lets_category_locked/);
    expect(sql).toMatch(/new\.lets_starter is distinct from old\.lets_starter/);
    expect(sql).toMatch(/lets_starter_locked/);
    const probe = readFileSync(join(root, "docs/audit/probes/202_lets_gatherings.probe.sql"), "utf8");
    expect(probe).toMatch(/fifth Let''s event/);
    expect(probe).toMatch(/lets_event_rate_limited/);
    expect(probe).toMatch(/ordinary cap is unchanged/);
    expect(probe).toMatch(/lets_category_locked/);
  });

  it("is security definer with an empty search_path, one direct-call guard, and no anon execute", () => {
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = ''/);
    expect(sql).toMatch(/v_uid uuid := auth\.uid\(\)/);
    expect(sql).toMatch(/if v_uid is null then/);
    expect(sql).toMatch(/if TG_OP is null then/);
    expect(sql.match(/raise exception 'not allowed'/g)).toEqual(["raise exception 'not allowed'"]);
    expect(sql).not.toMatch(/if v_uid is null then\s*raise exception 'not allowed'/);
    expect(sql).toMatch(/revoke all on function public\.events_enforce_community_rate_limit\(\) from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant execute on function public\.events_enforce_community_rate_limit\(\) to (anon|authenticated)/);
    expect(sql).toMatch(/grant execute on function public\.events_enforce_community_rate_limit\(\) to service_role/);
  });
});

describe("missingLetsColumn", () => {
  it("recognises a column the migration has not added yet", () => {
    expect(missingLetsColumn({ code: "42703", message: 'column events.lets_starter does not exist' })).toBe(true);
    expect(missingLetsColumn({ code: "PGRST204", message: "Could not find the 'lets_starter' column of 'events' in the schema cache" })).toBe(true);
    expect(missingLetsColumn({ code: "PGRST204", message: "Could not find the 'title' column" })).toBe(false);
    expect(missingLetsColumn(null)).toBe(false);
  });
});
