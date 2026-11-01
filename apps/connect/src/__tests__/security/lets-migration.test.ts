/**
 * Migration 202 is a proposal. It is not applied here. These checks pin the
 * exemption, the empty search_path, and the anon revoke so a later edit cannot
 * quietly drop them. 201 stays free for issue #314.
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

  it("exempts a Let's row, still caps ordinary citizen events, and uses the same starter ids as the app", () => {
    expect(sql).toMatch(/if new\.lets_starter is not null then/);
    expect(sql).toMatch(/e\.lets_starter is null/);
    expect(sql).toMatch(/v_role is distinct from 'citizen'/);
    expect(sql).not.toMatch(/coalesce\(new\.community_contributor, false\) = false/);
    expect(sql).toMatch(/community_event_rate_limited/);
    const fromSql = [...sql.matchAll(/'(evangelise|run|pray|worship|social|clean-up|coffee|flashmob)'/g)].map((m) => m[1]);
    const fromLib = starterIds(lib);
    expect(fromSql).toEqual(fromLib);
    expect(new Set(fromSql).size).toBe(8);
  });

  it("is security definer with an empty search_path, an auth.uid() guard, and no anon execute", () => {
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = ''/);
    expect(sql).toMatch(/v_uid uuid := auth\.uid\(\)/);
    expect(sql).toMatch(/if v_uid is null then/);
    expect(sql).toMatch(/raise exception 'not allowed'/);
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
