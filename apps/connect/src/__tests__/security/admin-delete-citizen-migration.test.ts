// @vitest-environment node
/**
 * Static twin of migration 194. CI has no database, so this pins the guards
 * in the file: both functions are SECURITY DEFINER with an empty search_path,
 * a missing or non-admin auth.uid() raises, and anon cannot execute them.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "../..");
const raw = readFileSync(
  join(ROOT, "supabase/migrations/194_admin_delete_citizen_account.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

const lines = raw.split("\n");
const start = lines.findIndex((l) => l.trim() === "begin;");
const end = lines.findIndex((l, i) => i > start && l.trim() === "commit;");
const body = lines.slice(start + 1, end).join("\n");
const code = body.replace(/--[^\n]*/g, "");

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

describe("migration 194 is one unapplied transaction", () => {
  it("begins and commits once, and says it is not applied", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(raw).toMatch(/NOT APPLIED/);
    expect(raw).toMatch(/-- ── ROLLBACK/);
  });
});

describe("admin_list_citizens", () => {
  const f = fn("admin_list_citizens");

  it("is security definer, search_path empty, and raises unless auth.uid() is an admin", () => {
    expect(f.header).toMatch(/security definer/);
    expect(f.header).toMatch(/set search_path to ''/);
    expect(f.text).toMatch(/auth\.uid\(\) is null or not public\.is_admin\(\)/);
    expect(f.text).toMatch(/raise exception 'not_admin'/);
    expect(f.text).toMatch(/errcode = '42501'/);
  });

  it("lists citizens only and never selects an email into the result", () => {
    expect(f.text).toMatch(/p\.role = 'citizen'/);
    expect(f.text).toMatch(/p\.email ilike/);
    expect(f.text).not.toMatch(/'email'/);
    expect(f.text).toMatch(/jsonb_build_object\(\s*'id'/);
  });

  it("is not executable by public or anon", () => {
    expect(code).toMatch(
      /revoke all on function public\.admin_list_citizens\(text, text, text, text, integer\) from public, anon;/,
    );
    expect(code).toMatch(
      /grant execute on function public\.admin_list_citizens\(text, text, text, text, integer\) to authenticated;/,
    );
  });
});

describe("admin_delete_citizen_account", () => {
  const f = fn("admin_delete_citizen_account");

  it("is security definer, search_path empty, and raises unless auth.uid() is an admin", () => {
    expect(f.header).toMatch(/security definer/);
    expect(f.header).toMatch(/set search_path to ''/);
    expect(f.text).toMatch(/if v_caller is null or not public\.is_admin\(\)/);
    expect(f.text).toMatch(/raise exception 'not_admin'/);
  });

  it("refuses self, admins and contributor listings, and blocks wear and vision", () => {
    expect(f.text).toMatch(/cannot_delete_self/);
    expect(f.text).toMatch(/target_is_admin/);
    expect(f.text).toMatch(/not_a_citizen/);
    expect(f.text).toMatch(/v_row\.role is distinct from 'citizen'/);
    expect(f.text).toMatch(/wear\.brands/);
    expect(f.text).toMatch(/vision\.organisations/);
    expect(f.text).toMatch(/owns_wear_brand/);
    expect(f.text).toMatch(/has_vision_activity/);
  });

  it("audits the delete in the same function, with no email or name in the metadata", () => {
    expect(f.text).toMatch(/citizen_account_deleted/);
    expect(f.text).toMatch(/insert into public\.admin_actions/);
    // The preflight returns the display name so the modal can ask for it.
    // The audit row is counts only.
    const meta = /v_meta := jsonb_build_object\((.*?)\)/.exec(f.text);
    expect(meta, "audit metadata object").not.toBeNull();
    expect(meta![1]).not.toMatch(/'email'/);
    expect(meta![1]).not.toMatch(/'name'/);
    expect(f.text).not.toMatch(/'email'/);
    expect(f.text).toMatch(/delete from auth\.users where id = _user_id/);
    expect(f.text).toMatch(/foreign_key_violation/);
    expect(f.text).toMatch(/blocked_by_related_data/);
  });

  it("confirms a blank name with delete, case-insensitively, after trimming", () => {
    expect(f.text).toMatch(/nullif\(btrim\(v_row\.full_name\), ''\), 'delete'/);
    expect(f.text).toMatch(
      /lower\(btrim\(regexp_replace\(coalesce\(_confirm, ''\), '\\s\+', ' ', 'g'\)\)\)/,
    );
  });

  it("is not executable by public or anon", () => {
    expect(code).toMatch(
      /revoke all on function public\.admin_delete_citizen_account\(uuid, boolean, text\) from public, anon;/,
    );
    expect(code).toMatch(
      /grant execute on function public\.admin_delete_citizen_account\(uuid, boolean, text\) to authenticated;/,
    );
  });
});
