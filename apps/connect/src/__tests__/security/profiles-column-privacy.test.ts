/**
 * public.profiles column privacy — the contract behind migs 174–177.
 *
 * profiles rows are world-readable (RLS "Profiles are viewable by everyone"),
 * so the ONLY thing standing between the public anon key and every user's
 * email / home coordinates / demographics is the COLUMN allowlist granted to
 * anon + authenticated. Two things can silently reopen that hole, and this
 * file guards both without a database:
 *
 *  1. A migration re-granting table-level SELECT (or a private column) to
 *     anon/authenticated. We replay every GRANT/REVOKE touching profiles
 *     across the whole lineage and assert the end state is exactly PUBLIC.
 *     (Mig 082 is the cautionary tale: a column-level REVOKE under a
 *     table-level GRANT is a silent no-op — the replay models that.)
 *
 *  2. App code selecting a private column through the caller's own client.
 *     PostgREST answers 42501 for the WHOLE query, so e.g. adding `email` to
 *     CONTRIBUTOR_SELECT would blank every contributor on the map. We scan
 *     Connect's source for `.from("profiles").select(…)` and `profiles…(…)`
 *     embeds and require every column to be PUBLIC, except the explicit
 *     service-role reads listed in SERVICE_ROLE_READS.
 *
 * The live counterpart (anon really is denied) is
 * profiles-column-privacy.live.test.ts — it runs whenever Supabase env vars
 * are present.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { PRIVATE_PROFILE_COLUMNS, PUBLIC_PROFILE_COLUMNS } from "./profileColumns";

const REPO_ROOT = join(process.cwd(), "../..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase/migrations");
const SRC_DIR = join(process.cwd(), "src");

// ── 1. Migration lineage replay ───────────────────────────────────────────

type RoleGrants = { tableLevel: boolean; columns: Set<string> };
type LineageState = Record<"anon" | "authenticated", RoleGrants>;

function migrationFiles(): string[] {
  // Numbered files replay in number order; timestamp-named files (a single
  // historical one) sort after them, which is fine — the replay only reacts
  // to statements that touch profiles, and those all live in numbered files.
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => Number(a.split("_")[0]) - Number(b.split("_")[0]));
}

/** SQL → statements, with comments and dollar-quoted bodies removed. */
function statements(sql: string): string[] {
  return sql
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''")
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean);
}

function rolesIn(clause: string): Array<"anon" | "authenticated"> {
  const names = clause.split(/[ ,]+/).map((r) => r.trim());
  const out: Array<"anon" | "authenticated"> = [];
  if (names.includes("anon") || names.includes("public")) out.push("anon");
  if (names.includes("authenticated") || names.includes("public")) out.push("authenticated");
  return out;
}

const cols = (list: string) => list.split(",").map((c) => c.trim()).filter(Boolean);

const PROFILES = String.raw`(?:table )?(?:public\.)?profiles`;
const ALL_PUBLIC = String.raw`all tables in schema public`;

function replayLineage(upTo = Infinity): LineageState {
  // Supabase's default: anon + authenticated hold table-level SELECT on
  // every public table.
  const state: LineageState = {
    anon: { tableLevel: true, columns: new Set() },
    authenticated: { tableLevel: true, columns: new Set() },
  };
  for (const file of migrationFiles()) {
    if (Number(file.split("_")[0]) > upTo) continue;
    for (const st of statements(readFileSync(join(MIGRATIONS_DIR, file), "utf8"))) {
      let m: RegExpMatchArray | null;
      if ((m = st.match(new RegExp(String.raw`^grant (?:select|all(?: privileges)?)(?: on (?:${PROFILES}|${ALL_PUBLIC})) to (.+)$`)))) {
        for (const r of rolesIn(m[1])) state[r].tableLevel = true;
      } else if ((m = st.match(new RegExp(String.raw`^grant select \(([^)]*)\) on ${PROFILES} to (.+)$`)))) {
        for (const r of rolesIn(m[2])) cols(m[1]).forEach((c) => state[r].columns.add(c));
      } else if ((m = st.match(new RegExp(String.raw`^revoke (?:select|all(?: privileges)?) on (?:${PROFILES}|${ALL_PUBLIC}) from (.+)$`)))) {
        // A table-level REVOKE also drops every column-level entry.
        for (const r of rolesIn(m[1])) state[r] = { tableLevel: false, columns: new Set() };
      } else if ((m = st.match(new RegExp(String.raw`^revoke select \(([^)]*)\) on ${PROFILES} from (.+)$`)))) {
        // Removes the column entries only; a table-level grant still covers
        // them (the mig 082 no-op).
        for (const r of rolesIn(m[2])) cols(m[1]).forEach((c) => state[r].columns.delete(c));
      }
    }
  }
  return state;
}

describe("profiles column privacy — migration lineage", () => {
  const state = replayLineage();

  it.each(["anon", "authenticated"] as const)(
    "%s holds no table-level SELECT on public.profiles",
    (role) => {
      expect(state[role].tableLevel).toBe(false);
    },
  );

  it.each(["anon", "authenticated"] as const)(
    "%s can SELECT exactly the PUBLIC columns",
    (role) => {
      expect([...state[role].columns].sort()).toEqual([...PUBLIC_PROFILE_COLUMNS].sort());
    },
  );

  it("PUBLIC and PRIVATE never overlap", () => {
    const pub = new Set<string>(PUBLIC_PROFILE_COLUMNS);
    expect(PRIVATE_PROFILE_COLUMNS.filter((c) => pub.has(c))).toEqual([]);
  });

  it("models the mig 082 footgun: its column REVOKE left the table GRANT (and every column) in place", () => {
    const st082 = statements(
      readFileSync(join(MIGRATIONS_DIR, "082_billing_privacy_and_trial_stamp.sql"), "utf8"),
    );
    expect(st082.some((s) => s.startsWith("revoke select (billing_tier"))).toBe(true);
    // Up to 175 the table-level grant still stood — billing, email and the
    // rest stayed readable by anon until 176 revoked it.
    const before176 = replayLineage(175);
    expect(before176.anon.tableLevel).toBe(true);
    expect(before176.authenticated.tableLevel).toBe(true);
  });

  it("176 alone keeps the five TRANSITIONAL columns that 177 then revokes", () => {
    const after176 = replayLineage(176);
    const transitional = [...after176.anon.columns].filter(
      (c) => !(PUBLIC_PROFILE_COLUMNS as readonly string[]).includes(c),
    );
    expect(transitional.sort()).toEqual(
      ["bio_setup_required", "force_reauth_at", "location_sharing", "notification_prefs", "terms_accepted_at"],
    );
  });
});

// ── 2. App code never selects a private column through a user client ─────

/**
 * Reads that legitimately include private columns because they run on the
 * service-role client, after their own authorisation check. Each entry is
 * file → the private columns it may name. Adding a line here is a security
 * review decision, not a test fix.
 */
const SERVICE_ROLE_READS: Record<string, string[]> = {
  // createAdminClient() after requireAdmin()
  "app/api/admin/users/route.ts": ["email"],
  "app/api/admin/suggestions/export/route.ts": ["email"],
  "app/api/admin/contributor-applications/route.ts": ["email"],
  "app/api/admin/pending-elevations/route.ts": ["email"],
  // `admin` = createAdminClient(); fan-out mute filter for broadcast pushes
  "app/api/contributor/[handle]/broadcasts/route.ts": ["muted_source_ids"],
  // Unused helper whose caller must pass the service-role client.
  "lib/contributors/pendingApplications.ts": ["email"],
};

/**
 * Never executed: the original design handoff's Supabase wiring reference
 * (its header says "NOT loaded by the prototype"; HTML_FRONTEND_WIRING_SPEC
 * cites it). It still selects a `wants_contributor` column that never
 * existed — the live client is auth-client.js.
 */
const NOT_EXECUTED = new Set(["frontend/supabase-auth.js"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : sourceFiles(full);
    return /\.(ts|tsx|js|jsx)$/.test(name) ? [full] : [];
  });
}

/** Column names in a PostgREST select list (aliases, casts and nested embeds stripped). */
function selectColumns(list: string): string[] {
  let flat = list;
  while (/\([^()]*\)/.test(flat)) flat = flat.replace(/[a-z_!:]*\([^()]*\)/gi, "");
  return flat
    .split(",")
    .map((c) => c.trim().replace(/^[a-z_]+:/i, "").replace(/::.*$/, "").trim())
    .filter(Boolean);
}

/** String literals in a snippet, in order. */
const literals = (s: string) =>
  [...s.matchAll(/(["'`])((?:(?!\1)[\s\S])*)\1/g)].map((m) => m[2]);

/** Resolve `.select(<arg>)`: a string literal, a `[...].join(",")`, or a same-file const. */
function selectArg(src: string, from: number): string | null {
  const rest = src.slice(from).trimStart();
  if (/^["'`]/.test(rest)) return literals(rest)[0] ?? null;
  if (rest.startsWith("[")) return literals(rest.slice(0, rest.indexOf("]"))).join(",");
  const ident = rest.match(/^([A-Z_][A-Z0-9_]*)\b/);
  if (ident) {
    const decl = src.match(new RegExp(String.raw`const ${ident[1]}\s*=\s*([\s\S]*?);`));
    return decl ? literals(decl[1]).join("") : null;
  }
  return null;
}

type Finding = { file: string; column: string };

function scanProfileReads(): { found: number; violations: Finding[] } {
  const privateSet = new Set<string>(PRIVATE_PROFILE_COLUMNS);
  const publicSet = new Set<string>(PUBLIC_PROFILE_COLUMNS);
  const violations: Finding[] = [];
  let found = 0;
  for (const full of sourceFiles(SRC_DIR)) {
    const file = relative(SRC_DIR, full).split("\\").join("/");
    if (NOT_EXECUTED.has(file)) continue;
    const src = readFileSync(full, "utf8");
    const allowed = new Set(SERVICE_ROLE_READS[file] ?? []);
    const lists: string[] = [];
    // Comments may sit between the calls (v1/profiles/[id] has one).
    const fromSelect = /\.from\(\s*["'`]profiles["'`]\s*\)(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*\.select\(/g;
    for (const m of src.matchAll(fromSelect)) {
      const arg = selectArg(src, m.index! + m[0].length);
      if (arg !== null) lists.push(arg);
    }
    for (const m of src.matchAll(/\bprofiles(?:![a-z_]+|:[a-z_]+)?\(([^()]*)\)/g)) lists.push(m[1]);
    for (const list of lists) {
      found += 1;
      for (const col of selectColumns(list)) {
        if (col === "*" || (privateSet.has(col) && !allowed.has(col))) violations.push({ file, column: col });
        else if (!publicSet.has(col) && !privateSet.has(col)) {
          // Unknown column: either a typo or a column added after 176 —
          // which is PRIVATE by default until a migration grants it.
          violations.push({ file, column: `${col} (not in the PUBLIC allowlist)` });
        }
      }
    }
  }
  return { found, violations };
}

describe("profiles column privacy — app code", () => {
  const { found, violations } = scanProfileReads();

  it("the scanner actually sees the profiles reads (guards against a silent no-op)", () => {
    expect(found).toBeGreaterThan(40);
  });

  it("no user/anon-client profiles read names a private column or `*`", () => {
    expect(violations).toEqual([]);
  });

  it("CONTRIBUTOR_SELECT (map + Kingdom Discovery hydration) is all PUBLIC", () => {
    const src = readFileSync(join(SRC_DIR, "frontend/app/store.jsx"), "utf8");
    const decl = src.match(/const CONTRIBUTOR_SELECT\s*=\s*([\s\S]*?);/);
    expect(decl).not.toBeNull();
    const list = literals(decl![1]).join("");
    const pub = new Set<string>(PUBLIC_PROFILE_COLUMNS);
    expect(selectColumns(list).filter((c) => !pub.has(c))).toEqual([]);
  });
});
