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

/** Strip `-- …` comments so a word in a comment can never satisfy a check. */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

// Every test here replays the whole lineage (~180 files). Reading and stripping it again
// for each call pushed single tests past vitest's 5 s default on a busy machine, so the
// lineage is read once and each function's live definition is worked out once.
let lineageCache: { file: string; sql: string }[] | null = null;
function lineage(): { file: string; sql: string }[] {
  lineageCache ??= readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => Number(a.split("_")[0]) - Number(b.split("_")[0]))
    .map((file) => ({ file, sql: stripComments(readFileSync(join(MIGRATIONS_DIR, file), "utf8")) }));
  return lineageCache;
}

type Definition = { file: string; header: string; body: string };

/** Every `create or replace function public.<name>` in a file, in order. */
function definitionsIn(file: string, sql: string, name: string): Definition[] {
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
const liveCache = new Map<string, Definition | null>();
function liveDefinition(name: string): Definition | null {
  if (liveCache.has(name)) return liveCache.get(name) ?? null;
  let last: Definition | null = null;
  for (const { file, sql } of lineage()) {
    for (const d of definitionsIn(file, sql, name)) last = d;
    if (new RegExp(`drop\\s+function\\s+(if\\s+exists\\s+)?public\\.${name}\\b`, "i").test(sql)) last = null;
  }
  liveCache.set(name, last);
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
  it("claim_admin_created_contributor resets the flag and keeps search_path = ''", () => {
    const def = liveDefinition("claim_admin_created_contributor");
    expect(def).not.toBeNull();
    expect(flat(def!.header)).toMatch(/set search_path to ''/);
    expect(flat(def!.body)).toMatch(/contributor_status = 'approved',\s*contributor_hidden = false/);
  });
});

// ── D-12: an applicant can never approve themselves ──────────────────────
// There were four doors (mig 180's header lists them). The RPC is gone, the
// trigger no longer lets a signed-in user flip their own role/status, and the
// application row is no longer client-writable.

describe("D-12: no self-approval path is left", () => {
  it("self_approve_contributor_application is dropped, not just revoked", () => {
    expect(liveDefinition("self_approve_contributor_application")).toBeNull();
  });

  const guard = liveDefinition("protect_role_column");

  it("protect_role_column is SECURITY INVOKER and trusts only non-anon/authenticated sessions", () => {
    expect(guard).not.toBeNull();
    const h = flat(guard!.header);
    expect(h).not.toContain("security definer"); // current_user would always be the owner
    expect(h).toMatch(/set search_path to ''/);
    expect(flat(guard!.body)).toContain("current_user not in ('anon', 'authenticated')");
  });

  it("protect_role_column no longer lets a user change their own role or approve their own status", () => {
    const b = flat(guard!.body);
    // The two exemptions that made self-approval possible.
    expect(b).not.toMatch(/new\.id = auth\.uid\(\)/);
    expect(b).not.toMatch(/new\.contributor_status = 'approved'/);
    expect(b).not.toMatch(/new\.role = 'contributor'/);
    // Apply and re-apply are the only user transitions left.
    expect(b).toContain("old.contributor_status = 'not_applied' and new.contributor_status = 'pending'");
    expect(b).toContain("old.contributor_status = 'rejected' and new.contributor_status = 'pending'");
  });

  it("clients cannot write contributor_applications (server-written only)", () => {
    const sql = lineage()
      .map((m) => m.sql)
      .join("\n");
    const flatSql = flat(sql);
    expect(flatSql).toContain("revoke all on table public.contributor_applications from anon");
    expect(flatSql).toMatch(
      /revoke insert, update, delete, truncate, references, trigger on table public\.contributor_applications from authenticated/,
    );
  });

  it("approve copies the staged profile fields an applicant could edit while pending", () => {
    const def = liveDefinition("approve_contributor_application");
    const b = flat(def!.body);
    for (const col of [
      "cover_photo_urls",
      "x_handle",
      "linkedin_url",
      "whatsapp_number",
      "contributor_contact_email",
    ]) {
      expect(b).toContain(`${col} = `);
    }
  });
});
