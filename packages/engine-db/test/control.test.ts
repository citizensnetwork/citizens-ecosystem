/**
 * The control-plane line (`supabase-control/`), built from empty: the engine owner's own database.
 * There is no live control-plane project yet (ADR-001, decision 1), so this file and the CI job
 * that repeats it on the hosted Postgres image are the proof.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FEATURE_KEYS, FEATURES } from '@engine/config';
import {
  controlCatalogueCheckSql,
  grantableFeatures,
  grantableFeaturesSql,
  loadControlObjects,
} from '../src/control.ts';
import { compareWithLock, listMigrations, readLock, recordsItself } from '../src/migrations.ts';
import { linePaths } from '../src/paths.ts';
import { scanSql } from '../src/sql-scan.ts';
import {
  buildControlDatabase,
  checkWhenBroken,
  probeFiles,
  rows,
  runCheck,
  runProbe,
  runProbeSql,
  type Database,
} from './support/database.ts';

const line = linePaths('control');
const objects = loadControlObjects();
const migrations = listMigrations(line.migrations);
const CATALOGUE_CHECK = resolve(line.checks, 'catalogue.sql');
const FEATURES_SEED = resolve(line.migrations, '0003_grantable_features.sql');

let db: Database;

beforeAll(async () => {
  db = await buildControlDatabase();
});

afterAll(async () => {
  await db.close();
});

describe('the control-plane migration files and their lock', () => {
  it('are numbered without a gap and each records itself in the control ledger', () => {
    expect(migrations.length).toBeGreaterThanOrEqual(3);
    expect(
      migrations.filter((m) => !recordsItself(m, line.ledgerTable)).map((m) => m.file),
    ).toEqual([]);
    // A file of this line never writes the other line's ledger.
    expect(migrations.filter((m) => recordsItself(m)).map((m) => m.file)).toEqual([]);
  });

  it('match the lock: an applied migration never changes', () => {
    expect(compareWithLock(migrations, readLock(line.lock))).toEqual([]);
  });

  it('touch nothing but the private schema, the functions in public and the sign-in accounts', () => {
    const found = new Set<string>();
    for (const migration of migrations) {
      for (const segment of scanSql(migration.sql)) {
        if (segment.kind !== 'code') continue;
        for (const match of segment.text.matchAll(/\b([a-z_]+)\.[a-z_]+/g)) {
          found.add(match[1] as string);
        }
      }
    }
    for (const schema of ['engine', 'storage', 'cron', 'net', 'vision', 'wear', 'extensions']) {
      expect(found.has(schema), `a control-plane migration names the schema "${schema}"`).toBe(
        false,
      );
    }
  });

  it('hold no address, key or email address', () => {
    for (const migration of migrations) {
      expect(migration.sql, migration.file).not.toMatch(
        /https?:\/\/|supabase\.co|eyJ[A-Za-z0-9_-]{10}|[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[a-z]{2,}/,
      );
    }
  });
});

describe('the generated control-plane files', () => {
  it('the catalogue check is generated from the object list', () => {
    const sql = controlCatalogueCheckSql(objects, migrations);
    if (process.env.ENGINE_DB_WRITE === '1') writeFileSync(CATALOGUE_CHECK, sql, 'utf8');
    expect(existsSync(CATALOGUE_CHECK), 'run the tests once with ENGINE_DB_WRITE=1').toBe(true);
    expect(readFileSync(CATALOGUE_CHECK, 'utf8').replaceAll('\r\n', '\n')).toBe(sql);
  });

  it('the feature seed is what the generator gives for the features it holds', () => {
    // After the file is applied to a real control plane it never changes. A feature added later
    // gets a new migration (the next test says so), and this comparison keeps the seed honest
    // for the features it was written with.
    const seed = readFileSync(FEATURES_SEED, 'utf8').replaceAll('\r\n', '\n');
    const seeded = [...seed.matchAll(/^ {2}\('([A-Za-z0-9]+)'\)/gm)].map((match) => match[1]);
    expect(seeded.length).toBeGreaterThan(0);
    expect(grantableFeatures()).toEqual(expect.arrayContaining(seeded));
    const generated = grantableFeaturesSql('0003', 'grantable_features');
    if (seeded.length === grantableFeatures().length) expect(seed).toBe(generated);
  });

  it('a built control plane can allow exactly the features of the engine line', async () => {
    const stored = await rows<{ feature: string }>(
      db,
      'select feature from control.grantable_features order by feature collate "C"',
    );
    expect(
      stored.map((row) => row.feature),
      'the feature list changed: add a control-plane migration',
    ).toEqual(grantableFeatures());
    const citizensOnly = FEATURE_KEYS.filter((key) => FEATURES[key].line === 'citizens');
    expect(citizensOnly.length).toBeGreaterThan(0);
    for (const feature of citizensOnly) expect(grantableFeatures()).not.toContain(feature);
  });
});

describe('the control plane, built from empty', () => {
  it('holds exactly the listed objects', async () => {
    expect(await runCheck(db, 'catalogue.sql', 'control')).toBeNull();
  });

  it('passes the security check', async () => {
    expect(await runCheck(db, 'security.sql', 'control')).toBeNull();
  });

  it('has the eleven tables of the architecture record, a ledger and the feature list', async () => {
    const tables = await rows<{ name: string }>(
      db,
      `select c.relname::text as name from pg_class c
        where c.relnamespace = 'control'::regnamespace and c.relkind = 'r' order by 1`,
    );
    expect(tables.map((row) => row.name)).toEqual([...objects.tables].sort());
    for (const table of [
      'tenants',
      'tenant_domains',
      'tenant_infrastructure',
      'tenant_entitlements',
      'engine_releases',
      'tenant_schema_state',
      'provisioning_runs',
      'usage_totals',
      'support_access_grants',
      'audit_log',
      'superusers',
    ]) {
      expect(objects.tables, table).toContain(table);
    }
  });

  it('records every migration in its ledger and arrives with nobody on the list', async () => {
    const ledger = await rows<{ version: string; name: string }>(
      db,
      'select version, name from control.schema_migrations order by version',
    );
    expect(ledger).toEqual(migrations.map(({ version, name }) => ({ version, name })));
    const [counts] = await rows<{ superusers: number; tenants: number; audit: number }>(
      db,
      `select (select count(*)::int from control.superusers) as superusers,
              (select count(*)::int from control.tenants) as tenants,
              (select count(*)::int from control.audit_log) as audit`,
    );
    expect(counts).toEqual({ superusers: 0, tenants: 0, audit: 0 });
  });
});

describe('the control-plane catalogue check catches what it must', () => {
  const broken = (statement: string) => checkWhenBroken(db, statement, 'catalogue.sql', 'control');

  it('a table or a function nobody listed', async () => {
    expect(await broken('create table control.notes (id int primary key);')).toMatch(
      /table not expected: notes/,
    );
    expect(await broken('create table public.notes (id int primary key);')).toMatch(
      /relation in the public schema not expected: notes/,
    );
    expect(
      await broken('create function public.sneaky() returns int language sql as $$ select 1 $$;'),
    ).toMatch(/function not expected: sneaky/);
  });

  it('a function a visitor, the service role or everyone can call', async () => {
    expect(await broken('grant execute on function public.tenants_list() to anon;')).toMatch(
      /function a visitor can call not expected: tenants_list/,
    );
    expect(
      await broken(
        'grant execute on function public.audit_log_read(uuid, bigint, integer) to service_role;',
      ),
    ).toMatch(/function the service role can call not expected: audit_log_read/);
    expect(
      await broken(
        'grant execute on function control.bootstrap_first_superuser(uuid, text) to public;',
      ),
    ).toMatch(/private function open to every role not expected: bootstrap_first_superuser/);
  });

  it('a missing table, function or guard', async () => {
    expect(await broken('drop table control.usage_totals;')).toMatch(/table missing: usage_totals/);
    expect(await broken('drop function public.whoami();')).toMatch(
      /function missing: whoami.*function the signed-in role can call missing: whoami/s,
    );
    expect(await broken('drop trigger audit_log_no_change on control.audit_log;')).toMatch(
      /trigger missing: audit_log\.audit_log_no_change/,
    );
  });
});

describe('the control-plane security check catches what it must', () => {
  const broken = (statement: string) => checkWhenBroken(db, statement, 'security.sql', 'control');

  it('a table without row security, and any row policy', async () => {
    expect(await broken('alter table control.tenants disable row level security;')).toMatch(
      /no row security: tenants/,
    );
    expect(
      await broken(
        'create policy peek on control.audit_log for select to authenticated using (true);',
      ),
    ).toMatch(/a row policy exists: audit_log\.peek/);
  });

  it('a data API role holding anything on a table, a sequence or the schema', async () => {
    expect(await broken('grant select on control.tenants to authenticated;')).toMatch(
      /authenticated holds SELECT on tenants/,
    );
    expect(await broken('grant truncate on control.audit_log to service_role;')).toMatch(
      /service_role holds TRUNCATE on audit_log/,
    );
    expect(await broken('grant insert on control.superusers to public;')).toMatch(
      /everyone holds INSERT on superusers/,
    );
    expect(await broken('grant usage on sequence control.audit_log_id_seq to anon;')).toMatch(
      /anon can use the sequence audit_log_id_seq/,
    );
    expect(await broken('grant usage on schema control to service_role;')).toMatch(
      /service_role can use the private schema/,
    );
    expect(await broken('grant usage on schema control to public;')).toMatch(
      /everyone can use the private schema/,
    );
  });

  it('a function that skips the check of the caller, or keeps a search path', async () => {
    expect(
      await broken(
        `create function public.open_door() returns int language plpgsql security definer set search_path = ''
         as $$ begin return (select count(*) from control.tenants); end $$;`,
      ),
    ).toMatch(/function that does not start by checking the caller: open_door/);
    expect(
      await broken(
        `create function public.loose() returns int language sql security definer as $$ select 1 $$;`,
      ),
    ).toMatch(/function without an empty search path: loose/);
    expect(
      await broken(
        `create function public.plain() returns int language sql set search_path = '' as $$ select 1 $$;`,
      ),
    ).toMatch(/function without its owner's rights: plain/);
    expect(
      await broken(
        'alter function control.write_audit(control.superusers, text, uuid, text, jsonb, text) security definer;',
      ),
    ).toMatch(/private function with its owner's rights: write_audit/);
  });

  it('an audit log whose guard is gone, weakened or switched off', async () => {
    expect(await broken('drop trigger audit_log_no_truncate on control.audit_log;')).toMatch(
      /guard missing or switched off: audit_log\.audit_log_no_truncate/,
    );
    expect(
      await broken('alter table control.audit_log disable trigger audit_log_no_change;'),
    ).toMatch(/guard missing or switched off: audit_log\.audit_log_no_change/);
    expect(
      await broken(
        `drop trigger audit_log_no_change on control.audit_log;
         create trigger audit_log_no_change before update on control.audit_log
           for each row execute function control.audit_log_guard();`,
      ),
    ).toMatch(/the audit log guard does not cover both update and delete/);
  });

  it('a default that opens new objects', async () => {
    expect(
      await broken(
        'alter default privileges for role postgres grant execute on functions to public;',
      ),
    ).toMatch(
      /a default hands new functions to everyone|a new function is open to everyone by default/,
    );
    expect(
      await broken(
        'alter default privileges for role postgres in schema public grant select on tables to anon;',
      ),
    ).toMatch(/a default hands new tables to anon/);
  });
});

describe('control-plane probes', () => {
  it.each(probeFiles('control'))('%s', async (file) => {
    expect(await runProbe(db, file, 'control')).toBeNull();
  });

  it('are reported when they fail', async () => {
    const failing = "do $probe$ begin raise exception 'PROBE FAILED: on purpose'; end; $probe$;";
    expect(await runProbeSql(db, failing, 'control')).toMatch(/PROBE FAILED: on purpose/);
  });

  it('leave nothing behind', async () => {
    const [left] = await rows<{
      accounts: number;
      superusers: number;
      tenants: number;
      audit: number;
    }>(
      db,
      `select (select count(*)::int from auth.users) as accounts,
              (select count(*)::int from control.superusers) as superusers,
              (select count(*)::int from control.tenants) as tenants,
              (select count(*)::int from control.audit_log) as audit`,
    );
    expect(left).toEqual({ accounts: 0, superusers: 0, tenants: 0, audit: 0 });
  });
});
