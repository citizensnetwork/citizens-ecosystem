// @vitest-environment node
/**
 * Static twin of migration 193. A database is not available in CI, so this
 * pins the promises the migration makes: editors write an allow-list only,
 * viewers get no write policy, and profiles UPDATE is not widened.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(process.cwd(), "../..", "supabase/migrations/193_team_editor_listing_access.sql");
const sql = readFileSync(FILE, "utf8").replace(/--[^\n]*/g, "");
const flat = sql.replace(/\s+/g, " ").toLowerCase();

function fn(name: string): { header: string; body: string } {
  const start = new RegExp(`create or replace function public\\.${name}\\s*\\(`, "i").exec(sql);
  expect(start, `${name} not defined in mig 193`).not.toBeNull();
  const from = start!.index;
  const open = /\$([A-Za-z_]*)\$/.exec(sql.slice(from))!;
  const tag = open[0];
  const bodyStart = from + open.index + tag.length;
  const bodyEnd = sql.indexOf(tag, bodyStart);
  return {
    header: sql.slice(from, from + open.index).replace(/\s+/g, " ").toLowerCase(),
    body: sql.slice(bodyStart, bodyEnd).replace(/\s+/g, " ").toLowerCase(),
  };
}

/**
 * Columns a shared trigger may read. A reference is safe only when every
 * table that can reach that statement has the column. `id` is on all five.
 */
const TRIGGER_COLUMNS: Record<string, readonly string[]> = {
  events: ["id", "created_by"],
  places: ["id", "created_by"],
  news_posts: ["id", "contributor_id"],
  listing_sources: ["id", "contributor_id"],
  specialised_services: ["id", "contributor_id"],
};

function attachedTriggerTables(source: string): string[] {
  const names = [
    ...source.matchAll(
      /create trigger \w+ before insert or update or delete on public\.(\w+) for each row execute function public\.log_team_editor_write\(\)/g,
    ),
  ].map((match) => match[1]);
  return [...new Set(names)];
}

function skipSpace(source: string, index: number): number {
  let i = index;
  while (source[i] === " ") i += 1;
  return i;
}

function startsWithWord(source: string, index: number, word: string): boolean {
  if (!source.startsWith(word, index)) return false;
  const next = source[index + word.length];
  return next === undefined || !/[a-z0-9_]/.test(next);
}

/** Read until `terminator` (a word, or ";") at parenthesis depth 0. */
function readUntil(source: string, index: number, terminator: string): { text: string; end: number } {
  let depth = 0;
  const start = index;
  for (let i = index; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (depth === 0 && terminator === ";" && ch === ";") {
      return { text: source.slice(start, i), end: i + 1 };
    } else if (depth === 0 && terminator !== ";" && startsWithWord(source, i, terminator)) {
      return { text: source.slice(start, i), end: i };
    }
  }
  throw new Error(`unterminated ${terminator} at: ${source.slice(start, start + 80)}`);
}

/**
 * A pure `tg_table_name in (...)` test narrows the THEN/ELSE blocks.
 * The same test inside one expression that also reads a column does not:
 * PL/pgSQL plans that whole expression, so the column is resolved on every
 * table the trigger is attached to.
 */
function tableGuard(
  condition: string,
  tables: string[],
  attached: string[],
): { thenTables: string[]; elseTables: string[] } {
  let rest = condition.replace(/\btg_op\s*=\s*'[^']+'/g, " ");
  rest = rest.replace(/\band\b/g, " ").replace(/\s+/g, " ").trim();
  const listed = rest.match(/^tg_table_name in \(([^)]+)\)$/);
  const equal = rest.match(/^tg_table_name = '([a-z0-9_]+)'$/);
  const excluded = rest.match(/^tg_table_name not in \(([^)]+)\)$/);
  const match = listed ?? excluded;
  if (!match && !equal) return { thenTables: tables, elseTables: tables };
  const names = equal ? [equal[1]] : [...match![1].matchAll(/'([a-z0-9_]+)'/g)].map((item) => item[1]);
  for (const name of names) {
    if (!attached.includes(name)) {
      throw new Error(`tg_table_name lists ${name}, which this trigger is not attached to`);
    }
  }
  if (excluded) {
    return {
      thenTables: tables.filter((table) => !names.includes(table)),
      elseTables: tables.filter((table) => names.includes(table)),
    };
  }
  return {
    thenTables: tables.filter((table) => names.includes(table)),
    elseTables: tables.filter((table) => !names.includes(table)),
  };
}

function checkFieldRefs(expr: string, tables: string[]): void {
  for (const match of expr.matchAll(/\b(?:new|old)\.([a-z_][a-z0-9_]*)/g)) {
    const column = match[1];
    const missing = tables.filter((table) => !TRIGGER_COLUMNS[table]?.includes(column));
    if (missing.length > 0) {
      throw new Error(
        `shared trigger reads ${column}, which ${missing.join(", ")} do not have, in: ${expr.trim()}`,
      );
    }
  }
}

/**
 * Walk one trigger body. Field references are checked against the tables
 * that can reach that statement. Only a surrounding IF that is nothing but
 * a tg_table_name test narrows that set.
 */
function scanTriggerBody(body: string, attached: string[]): void {
  const beginAt = body.search(/\bbegin\b/);
  if (beginAt < 0) throw new Error("trigger body has no begin");
  const end = scanBlock(body, beginAt + "begin".length, attached, attached, "block");
  const leftover = body.slice(end).trim();
  if (leftover !== "" && !leftover.startsWith("end")) {
    throw new Error(`unparsed trigger tail: ${leftover.slice(0, 80)}`);
  }
}

function scanBlock(
  source: string,
  index: number,
  tables: string[],
  attached: string[],
  stop: "block" | "if",
): number {
  let i = index;
  while (i < source.length) {
    i = skipSpace(source, i);
    if (i >= source.length) return i;
    if (startsWithWord(source, i, "end")) {
      if (startsWithWord(source, i, "end if")) {
        if (stop === "if") return i;
        throw new Error(`unexpected end if near: ${source.slice(i, i + 40)}`);
      }
      if (stop === "block") return i;
      throw new Error(`unexpected end near: ${source.slice(i, i + 40)}`);
    }
    if (startsWithWord(source, i, "else") || startsWithWord(source, i, "elsif")) {
      if (stop === "if") return i;
      throw new Error(`unexpected else near: ${source.slice(i, i + 40)}`);
    }
    if (startsWithWord(source, i, "if")) {
      i += 2;
      const condition = readUntil(source, i, "then");
      checkFieldRefs(condition.text, tables);
      i = skipSpace(source, condition.end);
      if (!startsWithWord(source, i, "then")) throw new Error("if without then");
      i += 4;
      const guard = tableGuard(condition.text, tables, attached);
      i = scanBlock(source, i, guard.thenTables, attached, "if");
      i = skipSpace(source, i);
      if (startsWithWord(source, i, "else")) {
        i += 4;
        i = scanBlock(source, i, guard.elseTables, attached, "if");
        i = skipSpace(source, i);
      }
      if (!startsWithWord(source, i, "end if")) {
        throw new Error(`expected end if near: ${source.slice(i, i + 40)}`);
      }
      i += "end if".length;
      continue;
    }
    const statement = readUntil(source, i, ";");
    checkFieldRefs(statement.text, tables);
    i = statement.end;
  }
  return i;
}

describe("mig 193 team editor listing access", () => {
  it("guards the membership helper and returns false with no JWT", () => {
    const helper = fn("is_active_team_member");
    expect(helper.header).toContain("security definer");
    expect(helper.header).toMatch(/set search_path = ''/);
    expect(helper.body).toContain("(select auth.uid()) is not null");
    expect(helper.body).toContain("tm.status = 'active'");
    expect(flat).toContain("revoke all on function public.is_active_team_member(uuid, text[]) from public, anon");
    expect(flat).toContain("grant execute on function public.is_active_team_member(uuid, text[]) to authenticated");
  });

  it("names team_editor on activity_log and does not let an editor insert a log by hand", () => {
    expect(flat).toContain("actor_role in ('contributor', 'admin', 'system', 'team_editor')");
    expect(flat).not.toMatch(/create policy[^;]*activity_log[^;]*for insert/);
    const log = fn("log_team_editor_write");
    expect(log.header).toContain("security definer");
    expect(log.header).toMatch(/set search_path = ''/);
    expect(log.body).toContain("v_uid is null");
    expect(log.body).toContain("auth.uid()");
    expect(flat).toContain("revoke all on function public.log_team_editor_write() from public, anon, authenticated");
  });

  it("does not widen profiles UPDATE and allow-lists the public profile columns only", () => {
    expect(flat).not.toMatch(/create policy[^;]*on public\.profiles/);
    const rpc = fn("update_contributor_public_profile");
    expect(rpc.header).toContain("security definer");
    expect(rpc.header).toMatch(/set search_path = ''/);
    expect(rpc.body).toContain("forbidden_field");
    expect(rpc.body).toContain("public.is_active_team_member(p_contributor_id, array['editor'])");
    for (const col of [
      "bio",
      "website_url",
      "logo_url",
      "gallery_urls",
      "contributor_contact_email",
      "contributor_category",
    ]) {
      expect(rpc.body, col).toContain(`'${col}'`);
    }
    for (const banned of [
      "billing_tier",
      "role",
      "contributor_status",
      "contributor_hidden",
      "contributor_slug",
      "email",
      "deleted_at",
    ]) {
      expect(rpc.body, banned).not.toContain(`'${banned}'`);
    }
    expect(flat).toContain("revoke all on function public.update_contributor_public_profile(uuid, jsonb) from public, anon");
  });

  it("gives viewers a read of events only, and write policies to editors", () => {
    expect(flat).toContain("is_active_team_member(created_by, array['editor', 'viewer'])");
    const writes = flat.match(/for (insert|update|delete) to authenticated/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    const writeChunks = flat.split(/create policy /).slice(1);
    for (const chunk of writeChunks) {
      const head = chunk.slice(0, 400);
      if (/for (insert|update|delete)/.test(head) && /array\['editor', 'viewer'\]/.test(head)) {
        throw new Error("a write policy includes viewers: " + head.slice(0, 180));
      }
    }
    expect(flat).toContain("is_active_team_member(contributor_id, array['editor'])");
  });

  it("does not read an owner column from a table that lacks it", () => {
    const attached = attachedTriggerTables(flat);
    expect(attached.sort()).toEqual(
      ["events", "listing_sources", "news_posts", "places", "specialised_services"].sort(),
    );
    for (const table of attached) {
      expect(TRIGGER_COLUMNS[table], table).toBeTruthy();
    }
    const log = fn("log_team_editor_write");
    expect(() => scanTriggerBody(log.body, attached)).not.toThrow();
    // The guard has to see the real mistake, not only the fixed file.
    const sharedIf =
      "begin if tg_op = 'update' and tg_table_name in ('events', 'places') and new.created_by is distinct from old.created_by then return new; end if; end;";
    expect(() => scanTriggerBody(sharedIf, attached)).toThrow(/created_by/);
    const otherIf =
      "begin if tg_op = 'update' and tg_table_name not in ('events', 'places') and new.contributor_id is distinct from old.contributor_id then return new; end if; end;";
    expect(() => scanTriggerBody(otherIf, attached)).toThrow(/contributor_id/);
  });

  it("restates search_path on the replaced suggestion function", () => {
    const decide = fn("decide_listing_suggestion");
    expect(decide.header).toMatch(/set search_path = ''/);
    expect(decide.header).toContain("security definer");
    expect(decide.body).toContain("team_editor");
    expect(flat).toContain("revoke all on function public.decide_listing_suggestion(uuid, text, uuid) from public, anon");
  });
});
