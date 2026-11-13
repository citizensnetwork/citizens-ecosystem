/**
 * The cut: a structure dump of the source database, plus the allow-list, gives the generated
 * part of the engine baseline.
 *
 * The dump is the catalogue of one schema at a pinned head (tables, columns, constraints,
 * indexes, policies, triggers, views, functions, grants). It is never committed. What this file
 * writes is committed and reviewed: plain SQL that builds from an empty database.
 *
 * Out is the default. An object of the dump that the allow-list does not name stops the cut
 * with an error, so a new object in the source can never slip into a tenant unnoticed.
 */

import type { Allowlist } from './allowlist.ts';
import { citizensOnlyFunctions } from './allowlist.ts';

/* ── The dump's shape ──────────────────────────────────────────────── */

export interface DumpColumn {
  readonly n: string;
  readonly t: string;
  readonly nn: boolean;
  readonly d: string | null;
  readonly id: string;
  readonly gen: string;
  readonly acl: readonly string[] | null;
}
export interface DumpTable {
  readonly name: string;
  readonly rls: boolean;
  readonly force_rls: boolean;
  readonly replident: string;
  readonly owner: string;
  readonly acl: readonly string[] | null;
  readonly cols: readonly DumpColumn[];
}
export interface DumpConstraint {
  readonly t: string;
  readonly n: string;
  readonly k: string;
  readonly def: string;
}
export interface DumpIndex {
  readonly t: string;
  readonly n: string;
  readonly def: string;
  readonly con: boolean;
}
export interface DumpPolicy {
  readonly t: string;
  readonly n: string;
  readonly cmd: string;
  readonly perm: boolean;
  readonly roles: readonly string[];
  readonly using: string | null;
  readonly check: string | null;
}
export interface DumpTrigger {
  readonly t: string;
  readonly n: string;
  readonly def: string;
  readonly enabled: string;
  readonly fn: string;
}
export interface DumpView {
  readonly n: string;
  readonly def: string;
  readonly options: readonly string[] | null;
  readonly acl: readonly string[] | null;
}
export interface DumpFunction {
  readonly n: string;
  readonly args: string;
  readonly kind: string;
  readonly def: string | null;
  readonly acl: readonly string[] | null;
  readonly owner: string;
}
export interface DumpSequence {
  readonly sequencename: string;
  readonly data_type: string;
}
export interface DumpBucket {
  readonly id: string;
  readonly name: string;
  readonly public: boolean;
  readonly limit: number | null;
  readonly mime: readonly string[] | null;
}
export interface Dump {
  readonly pinned_at: string;
  readonly server_version: string;
  readonly tables: readonly DumpTable[];
  readonly constraints: readonly DumpConstraint[];
  readonly indexes: readonly DumpIndex[];
  readonly policies: readonly DumpPolicy[];
  readonly triggers: readonly DumpTrigger[];
  readonly views: readonly DumpView[];
  readonly sequences: readonly DumpSequence[];
  readonly seq_owned: readonly {
    seq: string;
    tbl: string;
    col: string;
    acl: readonly string[] | null;
  }[];
  readonly buckets: readonly DumpBucket[];
  readonly publication: readonly string[];
  readonly functions: readonly DumpFunction[];
}

/* ── Small helpers ─────────────────────────────────────────────────── */

const quoteIdent = (name: string) =>
  /^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replaceAll('"', '""')}"`;
const quoteLiteral = (text: string) => `'${text.replaceAll("'", "''")}'`;
const lf = (text: string) => text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
const mentions = (text: string, word: string) =>
  new RegExp(
    `(?<![A-Za-z0-9_])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`,
  ).test(text);

const API_ROLES = ['anon', 'authenticated', 'service_role'] as const;
type ApiRole = (typeof API_ROLES)[number];
const isApiRole = (role: string): role is ApiRole =>
  (API_ROLES as readonly string[]).includes(role);

const TABLE_PRIVILEGES: Readonly<Record<string, string>> = {
  r: 'select',
  a: 'insert',
  w: 'update',
  d: 'delete',
  D: 'truncate',
  x: 'references',
  t: 'trigger',
  m: 'maintain',
};
const TABLE_PRIVILEGE_ORDER = [
  'select',
  'insert',
  'update',
  'delete',
  'truncate',
  'references',
  'trigger',
  'maintain',
];
/** What a role that speaks through the data API can ever need on a table. */
const API_TABLE_PRIVILEGES: ReadonlySet<string> = new Set(['select', 'insert', 'update', 'delete']);

interface AclItem {
  /** '' is PUBLIC. */
  readonly grantee: string;
  readonly privileges: string;
}

export function parseAcl(acl: readonly string[] | null): AclItem[] {
  return (acl ?? []).map((item) => {
    const match = /^("?)([^"=]*)\1=([A-Za-z*]*)\/.+$/.exec(item);
    if (!match) throw new Error(`Cannot read the grant "${item}".`);
    return { grantee: match[2] ?? '', privileges: (match[3] ?? '').replaceAll('*', '') };
  });
}

/** The table privileges a role keeps in the baseline, in a fixed order. */
function keptTablePrivileges(role: ApiRole, letters: string): string[] {
  const names = [...letters].map((letter) => {
    const name = TABLE_PRIVILEGES[letter];
    if (!name) throw new Error(`Unknown table privilege "${letter}".`);
    return name;
  });
  const kept =
    role === 'service_role' ? names : names.filter((name) => API_TABLE_PRIVILEGES.has(name));
  return TABLE_PRIVILEGE_ORDER.filter((name) => kept.includes(name));
}

function grantLines(
  kind: 'table' | 'sequence',
  target: string,
  byRole: ReadonlyMap<string, readonly string[]>,
  allCount: number,
): string[] {
  const groups = new Map<string, string[]>();
  for (const [role, privileges] of byRole) {
    if (privileges.length === 0) continue;
    const key = privileges.length === allCount ? 'all' : privileges.join(', ');
    groups.set(key, [...(groups.get(key) ?? []), role]);
  }
  return [...groups].map(
    ([privileges, roles]) => `grant ${privileges} on ${kind} ${target} to ${roles.join(', ')};`,
  );
}

/* ── The cut ───────────────────────────────────────────────────────── */

export interface CutResult {
  /** File name -> SQL text, for the generated migration files. */
  readonly files: Readonly<Record<string, string>>;
  /** What the baseline is expected to contain, for the build-from-empty proof. */
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

const HEADER = (number: string, title: string, extra?: string) =>
  [
    `-- Engine baseline ${number}: ${title}.`,
    '-- GENERATED by `pnpm --filter @engine/db cut` from a structure dump of the source database and',
    '-- supabase-engine/allowlist.json. Do not edit by hand: change the allow-list, or add a new',
    '-- migration after the baseline.',
    ...(extra === undefined ? [] : [extra]),
    '',
  ].join('\n');

const ledger = (version: string, name: string) =>
  `insert into engine.schema_migrations (version, name) values (${quoteLiteral(version)}, ${quoteLiteral(name)});\n`;

export function cutBaseline(dump: Dump, allowlist: Allowlist): CutResult {
  const engineTables = new Set(allowlist.tables.engine);
  const outTables = new Set(Object.keys(allowlist.tables.citizensOnly));
  const engineFunctions = new Set(allowlist.functions.engine);
  const changedFunctions = new Set(Object.keys(allowlist.functions.changed));
  const outFunctions = new Set(citizensOnlyFunctions(allowlist));
  const engineViews = new Set(allowlist.views.engine);
  const outViews = new Set(Object.keys(allowlist.views.citizensOnly));
  const engineTriggers = new Set(allowlist.triggers.engine);
  const outTriggers = new Set(allowlist.triggers.citizensOnly);
  const cutColumns = (table: string): ReadonlySet<string> =>
    new Set(Object.keys(allowlist.columns.citizensOnly[table] ?? {}));

  /* Out is the default: every object of the dump must be named by the allow-list. */
  const unlisted: string[] = [];
  for (const table of dump.tables) {
    if (!engineTables.has(table.name) && !outTables.has(table.name))
      unlisted.push(`table ${table.name}`);
  }
  for (const fn of dump.functions) {
    if (!engineFunctions.has(fn.n) && !changedFunctions.has(fn.n) && !outFunctions.has(fn.n)) {
      unlisted.push(`function ${fn.n}`);
    }
  }
  for (const view of dump.views) {
    if (!engineViews.has(view.n) && !outViews.has(view.n)) unlisted.push(`view ${view.n}`);
  }
  for (const trigger of dump.triggers) {
    const key = `${trigger.t}.${trigger.n}`;
    if (!engineTriggers.has(key) && !outTriggers.has(key)) unlisted.push(`trigger ${key}`);
  }
  if (unlisted.length > 0) {
    throw new Error(
      `Not in the allow-list (out is the default, but say so): ${unlisted.join(', ')}`,
    );
  }
  for (const name of [...engineTables, ...engineFunctions, ...changedFunctions, ...engineViews]) {
    const found =
      dump.tables.some((t) => t.name === name) ||
      dump.functions.some((f) => f.n === name) ||
      dump.views.some((v) => v.n === name);
    if (!found) throw new Error(`The allow-list names "${name}", which the dump does not have.`);
  }

  /* Anything an engine object says about a cut object is a leak. Find it before writing. */
  const deniedWords = [
    ...outTables,
    ...outFunctions,
    ...outViews,
    ...Object.values(allowlist.columns.citizensOnly).flatMap((columns) =>
      Object.keys(columns).filter((column) => column !== 'timezone'),
    ),
  ];
  const leaks: string[] = [];
  const checkText = (what: string, text: string | null) => {
    if (!text) return;
    for (const word of deniedWords)
      if (mentions(text, word)) leaks.push(`${what} mentions ${word}`);
    for (const schema of allowlist.schemas.citizensOnly) {
      if (new RegExp(`(?<![A-Za-z0-9_])${schema}\\.`).test(text))
        leaks.push(`${what} reads ${schema}.*`);
    }
  };

  /* ── 0002 tables ── */
  const tables = dump.tables
    .filter((t) => engineTables.has(t.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const tableSql: string[] = [
    HEADER('0002', 'tables, their constraints and indexes'),
    'set search_path = public, extensions;',
    '',
  ];
  const expectedColumns: Record<string, string[]> = {};

  for (const sequence of dump.sequences) {
    const owned = dump.seq_owned.find((entry) => entry.seq === sequence.sequencename);
    if (!owned || !engineTables.has(owned.tbl))
      throw new Error(`Sequence ${sequence.sequencename} has no engine table.`);
    tableSql.push(
      `create sequence public.${quoteIdent(sequence.sequencename)} as ${sequence.data_type};`,
      '',
    );
  }

  for (const table of tables) {
    const cut = cutColumns(table.name);
    const columns = table.cols.filter((column) => !cut.has(column.n));
    expectedColumns[table.name] = columns.map((column) => column.n);
    const lines = columns.map((column) => {
      if (column.id !== '' || column.gen !== '') {
        throw new Error(
          `${table.name}.${column.n} is an identity or generated column: not handled.`,
        );
      }
      const dropDefault = `${table.name}.${column.n}` in allowlist.defaults.dropped;
      const parts = [quoteIdent(column.n), column.t];
      if (column.d !== null && !dropDefault) {
        checkText(`default of ${table.name}.${column.n}`, column.d);
        parts.push(`default ${column.d}`);
      }
      if (column.nn) parts.push('not null');
      return `  ${parts.join(' ')}`;
    });
    tableSql.push(`create table public.${quoteIdent(table.name)} (`, lines.join(',\n'), ');');
    if (!table.rls) throw new Error(`${table.name} has row security off in the source.`);
    if (table.force_rls) throw new Error(`${table.name} forces row security: not handled.`);
    if (table.replident === 'f')
      tableSql.push(`alter table public.${quoteIdent(table.name)} replica identity full;`);
    else if (table.replident !== 'd')
      throw new Error(`${table.name}: replica identity ${table.replident} not handled.`);
    tableSql.push('');
  }
  for (const owned of dump.seq_owned) {
    tableSql.push(
      `alter sequence public.${quoteIdent(owned.seq)} owned by public.${quoteIdent(owned.tbl)}.${quoteIdent(owned.col)};`,
      '',
    );
  }

  const usesCutColumn = (table: string, text: string) =>
    [...cutColumns(table)].some((column) => mentions(text, column));
  const constraintLines = { first: [] as string[], foreign: [] as string[] };
  let constraintCount = 0;
  for (const constraint of dump.constraints) {
    if (!engineTables.has(constraint.t)) continue;
    if (constraint.n in allowlist.constraints.dropped) continue;
    if (usesCutColumn(constraint.t, constraint.def)) continue;
    const replaced = allowlist.constraints.replaced[constraint.n];
    const definition = replaced ?? constraint.def;
    checkText(`constraint ${constraint.n}`, definition);
    if (constraint.k === 'f') {
      const target = /REFERENCES ([A-Za-z0-9_."]+)\(/.exec(definition)?.[1] ?? '';
      if (outTables.has(target))
        throw new Error(`${constraint.n} points at the cut table ${target}.`);
    }
    const line = `alter table public.${quoteIdent(constraint.t)} add constraint ${quoteIdent(constraint.n)} ${definition};`;
    (constraint.k === 'f' ? constraintLines.foreign : constraintLines.first).push(line);
    constraintCount += 1;
  }
  for (const name of [
    ...Object.keys(allowlist.constraints.replaced),
    ...Object.keys(allowlist.constraints.dropped),
  ]) {
    if (!dump.constraints.some((c) => c.n === name))
      throw new Error(
        `The allow-list names the constraint "${name}", which the dump does not have.`,
      );
  }
  tableSql.push('-- primary keys, unique and check constraints', ...constraintLines.first, '');
  tableSql.push('-- foreign keys', ...constraintLines.foreign, '');

  let indexCount = 0;
  tableSql.push('-- indexes');
  for (const index of dump.indexes) {
    if (!engineTables.has(index.t) || index.con) continue;
    if (usesCutColumn(index.t, index.def)) continue;
    checkText(`index ${index.n}`, index.def);
    tableSql.push(`${index.def};`);
    indexCount += 1;
  }
  tableSql.push('', 'reset search_path;', '', ledger('0002', 'tables'));

  /* ── 0003 functions (the ones that go in as they are) ── */
  const functions = dump.functions
    .filter((f) => engineFunctions.has(f.n))
    .sort((a, b) => a.n.localeCompare(b.n));
  const functionSql: string[] = [
    HEADER('0003', 'the functions that go in exactly as they are in the source'),
    '-- A function may call one that is created later in this file.',
    'set check_function_bodies = off;',
    'set search_path = public, extensions;',
    '',
  ];
  for (const fn of functions) {
    if (fn.kind !== 'f' || fn.def === null) throw new Error(`${fn.n} is not a plain function.`);
    if (fn.owner !== 'postgres') throw new Error(`${fn.n} is owned by ${fn.owner}.`);
    checkText(`function ${fn.n}`, fn.def);
    functionSql.push(`${lf(fn.def).trimEnd()};`, '');
  }
  functionSql.push(
    'reset search_path;',
    'reset check_function_bodies;',
    '',
    ledger('0003', 'functions'),
  );

  /* ── 0006 views, triggers, row security ── */
  const rlsSql: string[] = [
    HEADER('0006', 'views, triggers and row security'),
    'set search_path = public, extensions;',
    '',
  ];
  const views = dump.views.filter((v) => engineViews.has(v.n));
  for (const view of views) {
    checkText(`view ${view.n}`, view.def);
    const options = (view.options ?? []).join(', ');
    if (!options.includes('security_invoker=on'))
      throw new Error(`View ${view.n} is not security_invoker.`);
    rlsSql.push(
      `create view public.${quoteIdent(view.n)} with (${options}) as`,
      `${lf(view.def).trimEnd().replace(/;$/, '')};`,
      '',
    );
  }
  const triggers = dump.triggers.filter((t) => engineTriggers.has(`${t.t}.${t.n}`));
  rlsSql.push('-- triggers');
  for (const trigger of triggers) {
    if (trigger.enabled !== 'O')
      throw new Error(`Trigger ${trigger.n} is not in its ordinary state.`);
    checkText(`trigger ${trigger.n}`, trigger.def);
    rlsSql.push(`${trigger.def};`);
  }
  rlsSql.push('', '-- row security: on for every table');
  for (const table of tables)
    rlsSql.push(`alter table public.${quoteIdent(table.name)} enable row level security;`);
  rlsSql.push('', '-- row policies');
  const COMMANDS: Readonly<Record<string, string>> = {
    r: 'select',
    a: 'insert',
    w: 'update',
    d: 'delete',
    '*': 'all',
  };
  const policyCounts: Record<string, number> = {};
  for (const policy of dump.policies) {
    if (!engineTables.has(policy.t)) continue;
    const command = COMMANDS[policy.cmd];
    if (!command) throw new Error(`Policy ${policy.n}: unknown command ${policy.cmd}.`);
    checkText(`policy ${policy.t}/${policy.n}`, `${policy.using ?? ''} ${policy.check ?? ''}`);
    if (usesCutColumn(policy.t, `${policy.using ?? ''} ${policy.check ?? ''}`)) {
      throw new Error(`Policy ${policy.t}/${policy.n} reads a cut column.`);
    }
    const parts = [
      `create policy ${quoteIdent(policy.n)} on public.${quoteIdent(policy.t)}`,
      `  as ${policy.perm ? 'permissive' : 'restrictive'} for ${command} to ${policy.roles.map(quoteIdent).join(', ')}`,
    ];
    if (policy.using !== null) parts.push(`  using (${policy.using})`);
    if (policy.check !== null) parts.push(`  with check (${policy.check})`);
    rlsSql.push(`${parts.join('\n')};`);
    policyCounts[policy.t] = (policyCounts[policy.t] ?? 0) + 1;
  }
  rlsSql.push('', 'reset search_path;', '', ledger('0006', 'views_triggers_policies'));

  /* ── 0007 grants ── */
  const grantSql: string[] = [
    HEADER(
      '0007',
      'grants, stated for every object',
      [
        '-- Every grant is written out, so the result does not depend on what a new project grants by',
        '-- default. Two deliberate differences from the source: the roles that speak through the data',
        '-- API (anon, authenticated) get no TRUNCATE, REFERENCES, TRIGGER or MAINTAIN on any table, and',
        '-- only SELECT on a view. Row security does not stop a TRUNCATE; these roles never need one.',
      ].join('\n'),
    ),
  ];
  const unexpectedGrantee = (what: string, grantee: string) => {
    if (grantee !== 'postgres' && grantee !== '' && !isApiRole(grantee)) {
      throw new Error(`${what} has a grant for "${grantee}": not handled.`);
    }
  };
  grantSql.push('-- tables');
  for (const table of tables) {
    const target = `public.${quoteIdent(table.name)}`;
    const byRole = new Map<string, string[]>();
    for (const item of parseAcl(table.acl)) {
      unexpectedGrantee(`Table ${table.name}`, item.grantee);
      if (item.grantee === '') throw new Error(`Table ${table.name} grants to PUBLIC.`);
      if (!isApiRole(item.grantee)) continue;
      const kept = keptTablePrivileges(item.grantee, item.privileges);
      // A table that only publishing may write: the data API roles keep SELECT and nothing else.
      const readOnly =
        table.name in allowlist.tables.readOnlyForDataApi && item.grantee !== 'service_role';
      byRole.set(
        item.grantee,
        readOnly ? kept.filter((privilege) => privilege === 'select') : kept,
      );
    }
    grantSql.push(`revoke all on table ${target} from public, anon, authenticated, service_role;`);
    grantSql.push(...grantLines('table', target, byRole, TABLE_PRIVILEGE_ORDER.length));
    const cut = cutColumns(table.name);
    const columnGrants = new Map<string, string[]>();
    for (const column of table.cols) {
      if (cut.has(column.n)) continue;
      for (const item of parseAcl(column.acl)) {
        unexpectedGrantee(`Column ${table.name}.${column.n}`, item.grantee);
        for (const letter of item.privileges) {
          const privilege = TABLE_PRIVILEGES[letter];
          if (privilege !== 'select' && privilege !== 'update' && privilege !== 'insert') {
            throw new Error(`Column grant ${letter} on ${table.name}.${column.n}: not handled.`);
          }
          const key = `${privilege}|${item.grantee}`;
          columnGrants.set(key, [...(columnGrants.get(key) ?? []), column.n]);
        }
      }
    }
    const byColumns = new Map<string, string[]>();
    for (const [key, columns] of columnGrants) {
      const [privilege, role] = key.split('|') as [string, string];
      const group = `${privilege}|${columns.join(', ')}`;
      byColumns.set(group, [...(byColumns.get(group) ?? []), role]);
    }
    for (const [group, roles] of byColumns) {
      const [privilege, columns] = group.split('|') as [string, string];
      grantSql.push(`grant ${privilege} (${columns}) on table ${target} to ${roles.join(', ')};`);
    }
  }
  grantSql.push('', '-- views: the data API roles may only read them');
  for (const view of views) {
    const target = `public.${quoteIdent(view.n)}`;
    const readers: string[] = [];
    for (const item of parseAcl(view.acl)) {
      unexpectedGrantee(`View ${view.n}`, item.grantee);
      if (isApiRole(item.grantee) && item.privileges.includes('r')) readers.push(item.grantee);
    }
    grantSql.push(`revoke all on table ${target} from public, anon, authenticated, service_role;`);
    if (readers.length > 0)
      grantSql.push(`grant select on table ${target} to ${readers.join(', ')};`);
  }
  grantSql.push('', '-- sequences');
  const SEQUENCE_PRIVILEGES: Readonly<Record<string, string>> = {
    r: 'select',
    w: 'update',
    U: 'usage',
  };
  for (const owned of dump.seq_owned) {
    const target = `public.${quoteIdent(owned.seq)}`;
    const byRole = new Map<string, string[]>();
    for (const item of parseAcl(owned.acl)) {
      unexpectedGrantee(`Sequence ${owned.seq}`, item.grantee);
      if (!isApiRole(item.grantee)) continue;
      byRole.set(
        item.grantee,
        [...item.privileges].map((letter) => {
          const name = SEQUENCE_PRIVILEGES[letter];
          if (!name) throw new Error(`Unknown sequence privilege "${letter}".`);
          return name;
        }),
      );
    }
    grantSql.push(
      `revoke all on sequence ${target} from public, anon, authenticated, service_role;`,
    );
    grantSql.push(...grantLines('sequence', target, byRole, 3));
  }
  grantSql.push('', '-- functions: who may call each one, exactly as in the source');
  const anonExecutable: string[] = [];
  const publicExecutable: string[] = [];
  const granted = dump.functions
    .filter((f) => engineFunctions.has(f.n) || changedFunctions.has(f.n))
    .sort((a, b) => a.n.localeCompare(b.n));
  for (const fn of granted) {
    const target = `public.${quoteIdent(fn.n)}(${fn.args})`;
    if (fn.acl === null)
      throw new Error(
        `${fn.n} has no stated grants (the built-in default): state them in the source first.`,
      );
    const grantees: string[] = [];
    for (const item of parseAcl(fn.acl)) {
      unexpectedGrantee(`Function ${fn.n}`, item.grantee);
      if (!item.privileges.includes('X')) continue;
      if (item.grantee === '') {
        grantees.push('public');
        publicExecutable.push(fn.n);
      } else if (isApiRole(item.grantee)) {
        grantees.push(item.grantee);
        if (item.grantee === 'anon') anonExecutable.push(fn.n);
      }
    }
    grantSql.push(
      `revoke all on function ${target} from public, anon, authenticated, service_role;`,
    );
    if (grantees.length > 0)
      grantSql.push(`grant execute on function ${target} to ${grantees.join(', ')};`);
  }
  grantSql.push('', ledger('0007', 'grants'));

  /* ── 0008 storage and realtime ── */
  const storageSql: string[] = [
    HEADER('0008', 'storage buckets, their rules, and the realtime publication'),
    'set search_path = public, extensions;',
    '',
  ];
  const engineBuckets = new Set(allowlist.storageBuckets.engine);
  const outBuckets = new Set(allowlist.storageBuckets.citizensOnly);
  for (const bucket of dump.buckets) {
    if (outBuckets.has(bucket.id)) continue;
    if (!engineBuckets.has(bucket.id))
      throw new Error(`Bucket ${bucket.id} is not in the allow-list.`);
    const mime =
      bucket.mime === null ? 'null' : `array[${bucket.mime.map(quoteLiteral).join(', ')}]`;
    storageSql.push(
      'insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)',
      `values (${quoteLiteral(bucket.id)}, ${quoteLiteral(bucket.name)}, ${bucket.public}, ${bucket.limit ?? 'null'}, ${mime})`,
      'on conflict (id) do nothing;',
      '',
    );
  }
  for (const policy of dump.policies) {
    if (policy.t !== 'storage.objects') continue;
    const text = `${policy.using ?? ''} ${policy.check ?? ''}`;
    const bucket = /bucket_id = '([^']+)'/.exec(text)?.[1];
    if (bucket === undefined) throw new Error(`Storage policy "${policy.n}" names no bucket.`);
    if (outBuckets.has(bucket)) continue;
    if (!engineBuckets.has(bucket))
      throw new Error(`Storage policy "${policy.n}" is for the unknown bucket ${bucket}.`);
    const command = COMMANDS[policy.cmd];
    if (!command) throw new Error(`Storage policy ${policy.n}: unknown command ${policy.cmd}.`);
    checkText(`storage policy ${policy.n}`, text);
    const parts = [
      `create policy ${quoteIdent(policy.n)} on storage.objects`,
      `  as ${policy.perm ? 'permissive' : 'restrictive'} for ${command} to ${policy.roles.map(quoteIdent).join(', ')}`,
    ];
    if (policy.using !== null) parts.push(`  using (${policy.using})`);
    if (policy.check !== null) parts.push(`  with check (${policy.check})`);
    storageSql.push(`${parts.join('\n')};`);
  }
  storageSql.push('', '-- realtime: the tables the app listens to');
  const realtime = new Set(allowlist.realtime.engine);
  for (const entry of dump.publication) {
    const name = entry.replace(/^public\./, '');
    if (!realtime.has(name))
      throw new Error(`${entry} is published for realtime but not in the allow-list.`);
    storageSql.push(`alter publication supabase_realtime add table public.${quoteIdent(name)};`);
  }
  storageSql.push('', 'reset search_path;', '', ledger('0008', 'storage_and_realtime'));

  if (leaks.length > 0) {
    throw new Error(
      `The cut would carry something that stays out:\n  ${[...new Set(leaks)].join('\n  ')}`,
    );
  }

  return {
    files: {
      '0002_tables.sql': tableSql.join('\n'),
      '0003_functions.sql': functionSql.join('\n'),
      '0006_views_triggers_policies.sql': rlsSql.join('\n'),
      '0007_grants.sql': grantSql.join('\n'),
      '0008_storage_and_realtime.sql': storageSql.join('\n'),
    },
    expected: {
      tables: tables.map((t) => t.name),
      columns: expectedColumns,
      views: views.map((v) => v.n),
      functions: functions.map((f) => `${f.n}(${f.args})`),
      changedFunctions: [...changedFunctions].sort(),
      triggers: triggers.map((t) => `${t.t}.${t.n}`).sort(),
      policies: policyCounts,
      indexes: indexCount,
      constraints: constraintCount,
      anonExecutable: anonExecutable.sort(),
      publicExecutable: publicExecutable.sort(),
    },
  };
}
