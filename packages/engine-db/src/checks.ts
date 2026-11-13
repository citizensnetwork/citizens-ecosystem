/**
 * The catalogue check: one SQL file that fails when a built database is not exactly the engine
 * line. It is generated from three files (the lock of the cut, the allow-list, and the list of
 * what the engine line adds), so it runs anywhere SQL runs: in the unit tests, in CI against a
 * real Postgres, and against a tenant's project after a fan-out.
 *
 * It fails when something is missing, when something is there that nobody listed, when a name
 * that stays out of every tenant exists, or when a function can be called by someone the lists
 * do not name.
 */

import { readFileSync } from 'node:fs';
import { deniedColumns, deniedNames, type Allowlist } from './allowlist.ts';
import type { EngineMigration } from './migrations.ts';
import { BASELINE_LOCK_PATH, ENGINE_DIR } from './paths.ts';
import { resolve } from 'node:path';

export interface BaselineLock {
  readonly source: {
    readonly pinnedHead: string;
    readonly dumpedAt: string;
    readonly dumpSha256: string;
    readonly serverVersion: string;
  };
  readonly expected: {
    readonly tables: readonly string[];
    readonly columns: Readonly<Record<string, readonly string[]>>;
    readonly views: readonly string[];
    readonly functions: readonly string[];
    readonly changedFunctions: readonly string[];
    readonly triggers: readonly string[];
    readonly policies: Readonly<Record<string, number>>;
    readonly indexes: number;
    readonly constraints: number;
    readonly anonExecutable: readonly string[];
    readonly publicExecutable: readonly string[];
  };
}

export interface EngineObjects {
  readonly tables: readonly string[];
  readonly functions: readonly string[];
  readonly triggers: readonly string[];
  readonly anonExecutable: readonly string[];
  readonly publicExecutable: readonly string[];
  readonly privateSchemaFunctions: readonly string[];
  readonly privateSchemaTables: readonly string[];
}

export const ENGINE_OBJECTS_PATH = resolve(ENGINE_DIR, 'engine-objects.json');

export function loadBaselineLock(path: string = BASELINE_LOCK_PATH): BaselineLock {
  return JSON.parse(readFileSync(path, 'utf8')) as BaselineLock;
}

export function loadEngineObjects(path: string = ENGINE_OBJECTS_PATH): EngineObjects {
  return JSON.parse(readFileSync(path, 'utf8')) as EngineObjects;
}

/** Everything a database built from the engine line must contain in schema public, by name. */
export function expectedCatalogue(lock: BaselineLock, allowlist: Allowlist, engine: EngineObjects) {
  const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
  const cutFunctionNames = lock.expected.functions.map((entry) => entry.replace(/\(.*$/s, ''));
  return {
    tables: sorted([...lock.expected.tables, ...engine.tables]),
    views: sorted(lock.expected.views),
    functions: sorted([
      ...cutFunctionNames,
      ...lock.expected.changedFunctions,
      ...engine.functions,
    ]),
    triggers: sorted([...lock.expected.triggers, ...engine.triggers]),
    /** Functions the signed-out role can call: named for it, or open to everyone. */
    anonExecutable: sorted([
      ...lock.expected.anonExecutable,
      ...lock.expected.publicExecutable,
      ...engine.anonExecutable,
      ...engine.publicExecutable,
    ]),
    publicExecutable: sorted([...lock.expected.publicExecutable, ...engine.publicExecutable]),
    jobs: sorted([
      ...allowlist.scheduledJobs.engine,
      ...Object.keys(allowlist.scheduledJobs.changed),
    ]),
    buckets: sorted(allowlist.storageBuckets.engine),
    realtime: sorted(allowlist.realtime.engine),
    privateFunctions: sorted(engine.privateSchemaFunctions),
    privateTables: sorted(engine.privateSchemaTables),
  };
}

const literal = (text: string) => `'${text.replaceAll("'", "''")}'`;
const textArray = (values: readonly string[]) =>
  values.length === 0
    ? 'array[]::text[]'
    : `array[\n    ${values.map(literal).join(',\n    ')}\n  ]::text[]`;

export function catalogueCheckSql(
  lock: BaselineLock,
  allowlist: Allowlist,
  engine: EngineObjects,
  migrations: readonly Pick<EngineMigration, 'version'>[],
): string {
  const expected = expectedCatalogue(lock, allowlist, engine);
  const denied = deniedNames(allowlist);
  const columns = deniedColumns(allowlist);
  const versions = migrations.map((migration) => migration.version);

  // "missing" and "not expected" for one kind of object, as two statements.
  const compare = (label: string, expectedVar: string, actualQuery: string) => `
  v_problems := v_problems || coalesce((
    select array_agg(${literal(`${label} not expected: `)} || a.name order by a.name)
      from (${actualQuery}) a
     where not (a.name = any (${expectedVar}))), array[]::text[]);
  v_problems := v_problems || coalesce((
    select array_agg(${literal(`${label} missing: `)} || e.name order by e.name)
      from unnest(${expectedVar}) e(name)
     where not exists (select 1 from (${actualQuery}) a where a.name = e.name)), array[]::text[]);`;

  const publicFunctions = `select p.proname::text as name, p.oid, p.proacl
        from pg_catalog.pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and not exists (select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')`;

  return `-- The catalogue check of the engine line.
-- GENERATED by \`pnpm --filter @engine/db test\` (with ENGINE_DB_WRITE=1) from baseline.lock.json,
-- allowlist.json, engine-objects.json and the list of migration files. Do not edit by hand.
--
-- Run it against a database after the engine migrations. It changes nothing. It raises one error
-- that lists every problem: something missing, something nobody listed, a name that stays out of
-- every tenant, or a function someone unlisted can call.

do $catalogue$
declare
  v_problems text[] := array[]::text[];
  v_tables constant text[] := ${textArray(expected.tables)};
  v_views constant text[] := ${textArray(expected.views)};
  v_functions constant text[] := ${textArray(expected.functions)};
  v_triggers constant text[] := ${textArray(expected.triggers)};
  v_anon constant text[] := ${textArray(expected.anonExecutable)};
  v_public constant text[] := ${textArray(expected.publicExecutable)};
  v_jobs constant text[] := ${textArray(expected.jobs)};
  v_buckets constant text[] := ${textArray(expected.buckets)};
  v_realtime constant text[] := ${textArray(expected.realtime)};
  v_private_functions constant text[] := ${textArray(expected.privateFunctions)};
  v_private_tables constant text[] := ${textArray(expected.privateTables)};
  v_versions constant text[] := ${textArray(versions)};
  v_denied constant text[] := ${textArray(denied)};
  v_denied_columns constant text[] := ${textArray(columns)};
  v_denied_schemas constant text[] := ${textArray(allowlist.schemas.citizensOnly)};
  v_found text[];
begin
  -- 1. Exactly the listed objects, no more and no fewer.${compare(
    'table',
    'v_tables',
    `select c.relname::text as name from pg_catalog.pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')`,
  )}${compare(
    'view',
    'v_views',
    `select c.relname::text as name from pg_catalog.pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')`,
  )}${compare('function', 'v_functions', `select f.name from (${publicFunctions}) f`)}${compare(
    'trigger',
    'v_triggers',
    `select (case when n.nspname = 'public' then '' else n.nspname::text || '.' end) || c.relname::text || '.' || t.tgname::text as name
        from pg_catalog.pg_trigger t
        join pg_catalog.pg_class c on c.oid = t.tgrelid
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        join pg_catalog.pg_proc p on p.oid = t.tgfoid
       where not t.tgisinternal and (n.nspname = 'public' or p.pronamespace = 'public'::regnamespace)`,
  )}${compare(
    'private function',
    'v_private_functions',
    `select p.proname::text as name from pg_catalog.pg_proc p where p.pronamespace = 'engine'::regnamespace`,
  )}${compare(
    'private table',
    'v_private_tables',
    `select c.relname::text as name from pg_catalog.pg_class c where c.relnamespace = 'engine'::regnamespace and c.relkind = 'r'`,
  )}${compare('migration', 'v_versions', `select m.version as name from engine.schema_migrations m`)}${compare(
    'storage bucket',
    'v_buckets',
    `select b.id::text as name from storage.buckets b`,
  )}${compare(
    'realtime table',
    'v_realtime',
    `select p.tablename::text as name from pg_catalog.pg_publication_tables p where p.pubname = 'supabase_realtime' and p.schemaname = 'public'`,
  )}

  -- 2. Who can call what: the signed-out role, and everyone.${compare(
    'function the signed-out role can call',
    'v_anon',
    `select f.name from (${publicFunctions}) f where pg_catalog.has_function_privilege('anon', f.oid, 'execute')`,
  )}${compare(
    'function open to every role',
    'v_public',
    `select f.name from (${publicFunctions}) f where exists (select 1 from pg_catalog.aclexplode(f.proacl) g where g.grantee = 0)`,
  )}

  -- 3. Scheduled jobs, where the scheduler exists.
  if pg_catalog.to_regclass('cron.job') is not null then
    execute 'select array_agg(j.jobname::text) from cron.job j' into v_found;
    v_problems := v_problems || coalesce((
      select array_agg('scheduled job not expected: ' || f.name order by f.name)
        from unnest(coalesce(v_found, array[]::text[])) f(name) where not (f.name = any (v_jobs))), array[]::text[]);
    v_problems := v_problems || coalesce((
      select array_agg('scheduled job missing: ' || e.name order by e.name)
        from unnest(v_jobs) e(name) where not (e.name = any (coalesce(v_found, array[]::text[])))), array[]::text[]);
  else
    v_problems := v_problems || array['the job scheduler is missing']::text[];
  end if;

  -- 4. Nothing that stays out of every tenant.
  v_problems := v_problems || coalesce((
    select array_agg('a schema that stays out exists: ' || n.nspname::text order by n.nspname)
      from pg_catalog.pg_namespace n where n.nspname::text = any (v_denied_schemas)), array[]::text[]);
  v_problems := v_problems || coalesce((
    select array_agg('a name that stays out exists: ' || x.kind || ' ' || x.name order by x.kind, x.name)
      from (
        select 'relation' as kind, c.relname::text as name
          from pg_catalog.pg_class c where c.relnamespace in ('public'::regnamespace, 'engine'::regnamespace)
        union all
        select 'function', p.proname::text
          from pg_catalog.pg_proc p where p.pronamespace in ('public'::regnamespace, 'engine'::regnamespace)
        union all
        select 'trigger', t.tgname::text from pg_catalog.pg_trigger t where not t.tgisinternal
        union all
        select 'column', a.attname::text
          from pg_catalog.pg_attribute a
          join pg_catalog.pg_class c on c.oid = a.attrelid
         where c.relnamespace = 'public'::regnamespace and a.attnum > 0 and not a.attisdropped
        union all
        select 'storage bucket', b.id::text from storage.buckets b
      ) x
     where x.name = any (v_denied)), array[]::text[]);
  v_problems := v_problems || coalesce((
    select array_agg('a column that stays out exists: ' || c.relname::text || '.' || a.attname::text)
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid = a.attrelid
     where c.relnamespace = 'public'::regnamespace and a.attnum > 0 and not a.attisdropped
       and (c.relname::text || '.' || a.attname::text) = any (v_denied_columns)), array[]::text[]);

  if pg_catalog.array_length(v_problems, 1) > 0 then
    raise exception 'CATALOGUE CHECK FAILED (% problems): %',
      pg_catalog.array_length(v_problems, 1), pg_catalog.array_to_string(v_problems, '; ');
  end if;
end;
$catalogue$;
`;
}
