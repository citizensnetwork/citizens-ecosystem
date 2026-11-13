/**
 * The build-from-empty proof. The whole engine line is applied to an empty database; then the
 * catalogue check, the security check and every rollback-only probe run against it.
 * CI repeats the same files against a real Postgres (.github/workflows/engine-baseline.yml).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAllowlist } from '../src/allowlist.ts';
import {
  catalogueCheckSql,
  expectedCatalogue,
  loadBaselineLock,
  loadEngineObjects,
} from '../src/checks.ts';
import { listMigrations } from '../src/migrations.ts';
import { CHECKS_DIR } from '../src/paths.ts';
import { engineWordingRows } from '../src/wording.ts';
import {
  buildEngineDatabase,
  probeFiles,
  rows,
  runCheck,
  runProbe,
  runProbeSql,
  type Database,
} from './support/database.ts';

const allowlist = loadAllowlist();
const lock = loadBaselineLock();
const engineObjects = loadEngineObjects();
const CATALOGUE_CHECK = resolve(CHECKS_DIR, 'catalogue.sql');

let db: Database;

beforeAll(async () => {
  db = await buildEngineDatabase();
});

afterAll(async () => {
  await db.close();
});

describe('the catalogue check file', () => {
  const sql = catalogueCheckSql(lock, allowlist, engineObjects, listMigrations());

  it('is generated from the lock, the allow-list and the engine object list', () => {
    if (process.env.ENGINE_DB_WRITE === '1') writeFileSync(CATALOGUE_CHECK, sql, 'utf8');
    expect(existsSync(CATALOGUE_CHECK), 'run the tests once with ENGINE_DB_WRITE=1').toBe(true);
    expect(readFileSync(CATALOGUE_CHECK, 'utf8').replaceAll('\r\n', '\n')).toBe(sql);
  });
});

describe('the engine line, built from empty', () => {
  it('holds exactly the listed objects and nothing that stays out', async () => {
    expect(await runCheck(db, 'catalogue.sql')).toBeNull();
  });

  it('passes the security check', async () => {
    expect(await runCheck(db, 'security.sql')).toBeNull();
  });

  it('has every table of the cut with exactly its columns', async () => {
    const actual = await rows<{ table: string; columns: string[] }>(
      db,
      `select c.relname::text as "table", array_agg(a.attname::text order by a.attnum) as columns
         from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
        group by c.relname`,
    );
    const byTable = Object.fromEntries(actual.map((row) => [row.table, row.columns]));
    for (const [table, columns] of Object.entries(lock.expected.columns)) {
      expect(byTable[table], table).toEqual(columns);
    }
    expect(Object.keys(lock.expected.columns)).toHaveLength(69);
  });

  it('has the policies, indexes and constraints the cut counted', async () => {
    const policies = await rows<{ table: string; count: number }>(
      db,
      `select tablename::text as "table", count(*)::int as count from pg_policies where schemaname = 'public' group by tablename`,
    );
    const counted = Object.fromEntries(policies.map((row) => [row.table, row.count]));
    for (const [table, count] of Object.entries(lock.expected.policies)) {
      expect(counted[table], `policies on ${table}`).toBe(count);
    }
    const cutTables = lock.expected.tables.map((table) => `'${table}'`).join(', ');
    const [totals] = await rows<{ indexes: number; constraints: number }>(
      db,
      `select
         (select count(*)::int from pg_index i join pg_class t on t.oid = i.indrelid
           where t.relnamespace = 'public'::regnamespace and t.relname in (${cutTables})
             and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)
             and i.indexrelid::regclass::text not like 'engine_%') as indexes,
         (select count(*)::int from pg_constraint k join pg_class t on t.oid = k.conrelid
           where k.connamespace = 'public'::regnamespace and t.relname in (${cutTables})
             and k.contype in ('p', 'u', 'c', 'f', 'x')) as constraints`,
    );
    expect(totals?.indexes).toBe(lock.expected.indexes);
    expect(totals?.constraints).toBe(lock.expected.constraints);
  });

  it('turns row security on for every table', async () => {
    const off = await rows<{ name: string }>(
      db,
      `select c.relname::text as name from pg_class c
        where c.relnamespace in ('public'::regnamespace, 'engine'::regnamespace) and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(off).toEqual([]);
  });

  it('carries the engine wording the message catalogue gives today', async () => {
    const stored = await rows<{ key: string; renderer: string; text: string }>(
      db,
      `select key, renderer, text from public.engine_wording where source = 'engine' order by key collate "C"`,
    );
    const expected = engineWordingRows()
      .map((row) => ({ key: row.key as string, renderer: row.renderer as string, text: row.text }))
      .sort((a, b) => (a.key < b.key ? -1 : 1));
    expect(stored).toEqual(expected);
  });

  it('schedules the engine jobs and never writes an address into one', async () => {
    const jobs = await rows<{ jobname: string; command: string }>(
      db,
      'select jobname, command from cron.job order by jobname',
    );
    expect(jobs.map((job) => job.jobname)).toEqual(
      expectedCatalogue(lock, allowlist, engineObjects).jobs,
    );
    for (const job of jobs) {
      expect(job.command, job.jobname).not.toMatch(/https?:|supabase|Bearer|eyJ/);
    }
  });

  it('records every migration in its ledger', async () => {
    const ledger = await rows<{ version: string; name: string }>(
      db,
      'select version, name from engine.schema_migrations order by version',
    );
    expect(ledger).toEqual(listMigrations().map(({ version, name }) => ({ version, name })));
  });

  it('gives a fingerprint that does not change between two builds', async () => {
    const first = await rows<{ part: string; hash: string }>(
      db,
      'select part, hash from engine.schema_fingerprint() order by part',
    );
    const other = await buildEngineDatabase();
    const second = await rows<{ part: string; hash: string }>(
      other,
      'select part, hash from engine.schema_fingerprint() order by part',
    );
    await other.close();
    expect(first.length).toBeGreaterThan(10);
    expect(second).toEqual(first);
  });
});

describe('the catalogue check catches what it must', () => {
  const broken = async (statement: string) => {
    await db.exec(`begin; ${statement}`);
    const result = await runCheck(db, 'catalogue.sql');
    await db.exec('rollback;');
    return result ?? '';
  };

  it('a table that stays out', async () => {
    expect(await broken('create table public.api_keys (id uuid primary key);')).toMatch(
      /table not expected: api_keys.*a name that stays out exists: relation api_keys/s,
    );
  });

  it('a column that stays out, even one with an everyday name', async () => {
    expect(await broken('alter table public.profiles add column timezone text;')).toMatch(
      /a column that stays out exists: profiles\.timezone/,
    );
    expect(await broken('alter table public.profiles add column billing_tier text;')).toMatch(
      /a name that stays out exists: column billing_tier/,
    );
  });

  it('a sibling schema', async () => {
    expect(await broken('create schema wear;')).toMatch(/a schema that stays out exists: wear/);
  });

  it('a function nobody listed, and one the signed-out role can newly call', async () => {
    expect(
      await broken('create function public.sneaky() returns int language sql as $$ select 1 $$;'),
    ).toMatch(/function not expected: sneaky/);
    expect(await broken('grant execute on function public.vote_on_idea(uuid) to anon;')).toMatch(
      /function the signed-out role can call not expected: vote_on_idea/,
    );
  });

  it('a missing table and a missing trigger', async () => {
    expect(await broken('drop table public.engine_wording cascade;')).toMatch(
      /table missing: engine_wording/,
    );
    expect(await broken('drop trigger protect_role_on_update on public.profiles;')).toMatch(
      /trigger missing: profiles\.protect_role_on_update/,
    );
  });
});

describe('the security check catches what it must', () => {
  const broken = async (statement: string) => {
    await db.exec(`begin; ${statement}`);
    const result = await runCheck(db, 'security.sql');
    await db.exec('rollback;');
    return result ?? '';
  };

  it('a table without row security', async () => {
    expect(await broken('alter table public.messages disable row level security;')).toMatch(
      /no row security: messages/,
    );
  });

  it('a data API role that can empty a table', async () => {
    expect(await broken('grant truncate on public.follows to authenticated;')).toMatch(
      /authenticated holds TRUNCATE on follows/,
    );
  });

  it('a signed-in role that can write what the world is allowed', async () => {
    expect(await broken('grant update on public.engine_entitlements to authenticated;')).toMatch(
      /authenticated can write engine_entitlements/,
    );
    expect(await broken('grant insert on public.engine_entitlements to service_role;')).toMatch(
      /service_role can write engine_entitlements/,
    );
  });

  it('an owner-rights function without a fixed search path', async () => {
    expect(
      await broken(
        'create function public.loose() returns int language sql security definer as $$ select 1 $$;',
      ),
    ).toMatch(/security definer without a fixed search path: loose/);
  });
});

describe('rollback-only probes', () => {
  it.each(probeFiles())('%s', async (file) => {
    expect(await runProbe(db, file)).toBeNull();
  });

  it('are reported when they fail, and still leave nothing behind', async () => {
    const failing = [
      "select pg_temp.probe_user('zed');",
      "do $probe$ begin raise exception 'PROBE FAILED: on purpose'; end; $probe$;",
    ].join(' ');
    expect(await runProbeSql(db, failing)).toMatch(/PROBE FAILED: on purpose/);
    // A probe that expects a refusal fails when the action is allowed.
    const allowed = [
      'set local role service_role;',
      'do $probe$ begin',
      '  begin perform 1 from public.engine_wording;',
      '  exception when insufficient_privilege then return; end;',
      "  raise exception 'PROBE FAILED: it was allowed';",
      'end; $probe$;',
    ].join(' ');
    expect(await runProbeSql(db, allowed)).toMatch(/PROBE FAILED: it was allowed/);
  });

  it('leave nothing behind', async () => {
    const [left] = await rows<{ users: number; configurations: number; notifications: number }>(
      db,
      `select (select count(*)::int from auth.users) as users,
              (select count(*)::int from public.engine_configuration) as configurations,
              (select count(*)::int from public.notifications) as notifications`,
    );
    expect(left).toEqual({ users: 0, configurations: 0, notifications: 0 });
  });
});
