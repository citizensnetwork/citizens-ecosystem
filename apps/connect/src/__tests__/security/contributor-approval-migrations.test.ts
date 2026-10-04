// @vitest-environment node
/**
 * The approve / reject RPCs that turn an account into (or refuse) a Contributor.
 *
 * Three real regressions lived here, each invisible to the type-checker and to
 * every mocked route test, because they only exist in the SQL:
 *
 *  1. `approve_contributor_application` inserted into `notifications(…, url)`.
 *     That column does not exist (it is `data jsonb`), so an admin approval
 *     RAISED and rolled back. Mig 084 had fixed it; mig 164 re-created the old
 *     body, and nothing noticed for six weeks.
 *  2. `CREATE OR REPLACE FUNCTION` silently drops `set search_path` (migs
 *     165/166/168), so a later re-creation can quietly weaken a hardened
 *     function.
 *  3. No approve path reset `contributor_hidden`, so an account an admin had
 *     removed (mig 178) and who re-applied was approved but never on the map.
 *
 * This replays the lineage and checks the LAST definition of each function:
 * the one that is actually live. It is the static twin of the rollback-only
 * probe in the PR description (a real database cannot run in CI).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "../..", "supabase/migrations");

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => Number(a.split("_")[0]) - Number(b.split("_")[0]));
}

/** Strip `-- …` comments so a word in a comment can never satisfy a check. */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

type Definition = { file: string; header: string; body: string };

/** Every `create or replace function public.<name>` in a file, in order. */
function definitionsIn(file: string, name: string): Definition[] {
  const sql = stripComments(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  const out: Definition[] = [];
  const start = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, "gi");
  let m: RegExpExecArray | null;
  while ((m = start.exec(sql))) {
    const from = m.index;
    const open = /\$([A-Za-z_]*)\$/.exec(sql.slice(from));
    if (!open) continue;
    const tag = open[0];
    const bodyStart = from + open.index + tag.length;
    const bodyEnd = sql.indexOf(tag, bodyStart);
    if (bodyEnd === -1) continue;
    out.push({
      file,
      header: sql.slice(from, from + open.index),
      body: sql.slice(bodyStart, bodyEnd),
    });
  }
  return out;
}

/** The definition that wins once every migration has run (or null if dropped). */
function liveDefinition(name: string): Definition | null {
  let last: Definition | null = null;
  for (const file of migrationFiles()) {
    const sql = stripComments(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    for (const d of definitionsIn(file, name)) last = d;
    if (new RegExp(`drop\\s+function\\s+(if\\s+exists\\s+)?public\\.${name}\\b`, "i").test(sql)) last = null;
  }
  return last;
}

const flat = (s: string) => s.replace(/\s+/g, " ").toLowerCase();

describe("approve_contributor_application (live definition)", () => {
  const def = liveDefinition("approve_contributor_application");

  it("exists", () => {
    expect(def).not.toBeNull();
  });

  it("keeps SECURITY DEFINER with search_path = '' and the null-uid guard", () => {
    const h = flat(def!.header);
    expect(h).toContain("security definer");
    expect(h).toMatch(/set search_path to ''/);
    expect(flat(def!.body)).toContain("auth.uid() is null or not public.is_admin()");
  });

  it("resets contributor_hidden when it approves (a removed-then-re-applied account must reach the map)", () => {
    expect(flat(def!.body)).toMatch(/contributor_status = 'approved',\s*contributor_hidden = false/);
  });

  it("copies no_fixed_location, and drops the pin for an online-only applicant", () => {
    const b = flat(def!.body);
    expect(b).toContain("contributor_no_fixed_location = coalesce(app.no_fixed_location");
    expect(b).toMatch(/physical_latitude = case when app\.no_fixed_location then null/);
  });

  it("writes its notification to columns that exist (data jsonb — there is no `url` column)", () => {
    const m = /insert into public\.notifications\s*\(([^)]*)\)/i.exec(def!.body);
    expect(m).not.toBeNull();
    const cols = m![1].split(",").map((c) => c.trim().toLowerCase());
    expect(cols).toContain("data");
    expect(cols).not.toContain("url");
  });
});

describe("reject_contributor_application (live definition)", () => {
  const def = liveDefinition("reject_contributor_application");

  it("keeps SECURITY DEFINER with search_path = '' and the null-uid guard", () => {
    expect(def).not.toBeNull();
    expect(flat(def!.header)).toMatch(/set search_path to ''/);
    expect(flat(def!.body)).toContain("auth.uid() is null or not public.is_admin()");
  });

  it("requires a reason, bounds it, and notifies through `data`", () => {
    const b = flat(def!.body);
    expect(b).toContain("reason_required");
    expect(b).toContain("reason_too_long");
    const m = /insert into public\.notifications\s*\(([^)]*)\)/i.exec(def!.body);
    expect(m![1].toLowerCase()).not.toMatch(/\burl\b/);
  });
});

describe("every other path that approves an account also resets contributor_hidden", () => {
  // self_approve is retired by a later migration; when it is gone this block
  // simply has one name fewer. The claim path stays.
  for (const name of ["self_approve_contributor_application", "claim_admin_created_contributor"]) {
    it(`${name} (if still live) resets the flag and keeps search_path = ''`, () => {
      const def = liveDefinition(name);
      if (def === null) return; // retired
      expect(flat(def.header)).toMatch(/set search_path to ''/);
      expect(flat(def.body)).toMatch(/contributor_status = 'approved',\s*contributor_hidden = false/);
    });
  }
});
