/**
 * The cut, on a small made-up dump. The real dump is private; this one has one of everything the
 * cut must keep, change or leave out, so every rule of the cut is exercised in the open.
 */

import { describe, expect, it } from 'vitest';
import type { Allowlist } from '../src/allowlist.ts';
import { cutBaseline, parseAcl, type Dump } from '../src/cut.ts';
import { findLeaks } from '../src/leaks.ts';

const ALL = 'arwdDxtm';
const owner = `postgres=${ALL}/postgres`;

function allowlist(): Allowlist {
  return {
    pinned: { citizensHead: '001_first', by: 'file name' },
    tables: {
      engine: ['owners', 'things'],
      changed: {},
      citizensOnly: { secret_stuff: 'Stays out.' },
      readOnlyForDataApi: { owners: 'Only one writer.' },
    },
    columns: { citizensOnly: { things: { billing_code: 'billing' } } },
    constraints: {
      replaced: { things_kind_check: "CHECK (kind ~ '^[a-z]+$'::text)" },
      dropped: { things_name_key: 'Not needed.' },
    },
    defaults: { dropped: { 'things.kind': 'A value of the source world.' } },
    views: { engine: ['things_view'], citizensOnly: { secret_view: 'Stays out.' } },
    functions: {
      engine: ['count_things', 'is_owner'],
      changed: { changed_fn: 'Edited by hand.' },
      citizensOnly: { billing: ['bill_thing'] },
    },
    triggers: {
      engine: ['auth.users.on_new', 'things.trg_things'],
      citizensOnly: ['secret_stuff.trg_secret', 'things.trg_bill'],
    },
    scheduledJobs: { engine: [], changed: {}, citizensOnly: [] },
    storageBuckets: { engine: ['pics'], citizensOnly: ['other-pics'] },
    realtime: { engine: ['things'] },
    schemas: { citizensOnly: ['wear'] },
    edgeFunctions: { changed: [] },
  };
}

function dump(): Dump {
  const column = (
    n: string,
    t: string,
    extra: Partial<Dump['tables'][number]['cols'][number]> = {},
  ) => ({
    n,
    t,
    nn: false,
    d: null,
    id: '',
    gen: '',
    acl: null,
    ...extra,
  });
  const fn = (n: string, acl: string[] | null, body = 'select 1') => ({
    n,
    args: '',
    kind: 'f',
    def: `CREATE OR REPLACE FUNCTION public.${n}()\r\n RETURNS integer\r\n LANGUAGE sql\r\nAS $function$ ${body} $function$\n`,
    acl,
    owner: 'postgres',
  });
  return {
    pinned_at: '2026-01-01T00:00:00Z',
    server_version: '17.6',
    tables: [
      {
        name: 'things',
        rls: true,
        force_rls: false,
        replident: 'f',
        owner: 'postgres',
        acl: [
          owner,
          'anon=rD/postgres',
          `authenticated=${ALL}/postgres`,
          `service_role=${ALL}/postgres`,
        ],
        cols: [
          column('id', 'uuid', { nn: true, d: 'gen_random_uuid()' }),
          column('name', 'text', { nn: true }),
          column('kind', 'text', { d: "'church'::text" }),
          column('billing_code', 'text'),
          column('owner_id', 'uuid'),
          column('Odd Name', 'bigint', { d: "nextval('things_seq'::regclass)" }),
        ],
      },
      {
        name: 'owners',
        rls: true,
        force_rls: false,
        replident: 'd',
        owner: 'postgres',
        acl: [owner, 'authenticated=arw/postgres', `service_role=${ALL}/postgres`],
        cols: [
          column('id', 'uuid', { nn: true, acl: ['anon=r/postgres', 'authenticated=r/postgres'] }),
          column('email', 'text', { acl: ['authenticated=w/postgres'] }),
        ],
      },
      {
        name: 'secret_stuff',
        rls: true,
        force_rls: false,
        replident: 'd',
        owner: 'postgres',
        acl: [owner],
        cols: [column('id', 'uuid')],
      },
    ],
    constraints: [
      { t: 'things', n: 'things_pkey', k: 'p', def: 'PRIMARY KEY (id)' },
      { t: 'things', n: 'things_name_key', k: 'u', def: 'UNIQUE (name)' },
      {
        t: 'things',
        n: 'things_kind_check',
        k: 'c',
        def: "CHECK (kind = ANY (ARRAY['church'::text]))",
      },
      { t: 'things', n: 'things_billing_check', k: 'c', def: 'CHECK (billing_code IS NOT NULL)' },
      {
        t: 'things',
        n: 'things_owner_fkey',
        k: 'f',
        def: 'FOREIGN KEY (owner_id) REFERENCES owners(id)',
      },
      { t: 'owners', n: 'owners_pkey', k: 'p', def: 'PRIMARY KEY (id)' },
      { t: 'secret_stuff', n: 'secret_pkey', k: 'p', def: 'PRIMARY KEY (id)' },
    ],
    indexes: [
      {
        t: 'things',
        n: 'things_pkey',
        def: 'CREATE UNIQUE INDEX things_pkey ON public.things USING btree (id)',
        con: true,
      },
      {
        t: 'things',
        n: 'things_name_idx',
        def: 'CREATE INDEX things_name_idx ON public.things USING btree (name)',
        con: false,
      },
      {
        t: 'things',
        n: 'things_billing_idx',
        def: 'CREATE INDEX things_billing_idx ON public.things USING btree (billing_code)',
        con: false,
      },
      {
        t: 'secret_stuff',
        n: 'secret_idx',
        def: 'CREATE INDEX secret_idx ON public.secret_stuff USING btree (id)',
        con: false,
      },
    ],
    policies: [
      {
        t: 'things',
        n: 'things read',
        cmd: 'r',
        perm: true,
        roles: ['public'],
        using: 'true',
        check: null,
      },
      {
        t: 'things',
        n: 'things_write',
        cmd: 'a',
        perm: false,
        roles: ['authenticated'],
        using: null,
        check: '(owner_id = auth.uid())',
      },
      {
        t: 'secret_stuff',
        n: 'secret',
        cmd: '*',
        perm: true,
        roles: ['public'],
        using: 'true',
        check: null,
      },
      {
        t: 'storage.objects',
        n: 'Pics upload',
        cmd: 'a',
        perm: true,
        roles: ['authenticated'],
        using: null,
        check: "(bucket_id = 'pics'::text)",
      },
      {
        t: 'storage.objects',
        n: 'Pics read',
        cmd: 'r',
        perm: true,
        roles: ['public'],
        using: "(bucket_id = 'pics'::text)",
        check: null,
      },
      {
        t: 'storage.objects',
        n: 'Other',
        cmd: 'r',
        perm: true,
        roles: ['public'],
        using: "(bucket_id = 'other-pics'::text)",
        check: null,
      },
    ],
    triggers: [
      {
        t: 'things',
        n: 'trg_things',
        def: 'CREATE TRIGGER trg_things BEFORE INSERT ON things FOR EACH ROW EXECUTE FUNCTION count_things()',
        enabled: 'O',
        fn: 'public.count_things',
      },
      {
        t: 'things',
        n: 'trg_bill',
        def: 'CREATE TRIGGER trg_bill AFTER INSERT ON things FOR EACH ROW EXECUTE FUNCTION bill_thing()',
        enabled: 'O',
        fn: 'public.bill_thing',
      },
      {
        t: 'auth.users',
        n: 'on_new',
        def: 'CREATE TRIGGER on_new AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION is_owner()',
        enabled: 'O',
        fn: 'public.is_owner',
      },
      {
        t: 'secret_stuff',
        n: 'trg_secret',
        def: 'CREATE TRIGGER trg_secret AFTER INSERT ON secret_stuff FOR EACH ROW EXECUTE FUNCTION is_owner()',
        enabled: 'O',
        fn: 'public.is_owner',
      },
    ],
    views: [
      {
        n: 'things_view',
        def: ' SELECT id, name\n   FROM things;',
        options: ['security_invoker=on'],
        acl: [owner, `anon=${ALL}/postgres`, 'authenticated=w/postgres'],
      },
      {
        n: 'secret_view',
        def: ' SELECT id FROM secret_stuff;',
        options: ['security_invoker=on'],
        acl: [owner],
      },
    ],
    sequences: [{ sequencename: 'things_seq', data_type: 'bigint' }],
    seq_owned: [
      {
        seq: 'things_seq',
        tbl: 'things',
        col: 'Odd Name',
        acl: ['postgres=rwU/postgres', 'anon=rwU/postgres', 'authenticated=U/postgres'],
      },
    ],
    buckets: [
      { id: 'pics', name: 'pics', public: true, limit: 1000, mime: ['image/png'] },
      { id: 'other-pics', name: 'other-pics', public: true, limit: null, mime: null },
    ],
    publication: ['public.things'],
    functions: [
      fn('count_things', ['=X/postgres', 'postgres=X/postgres', 'anon=X/postgres']),
      fn('is_owner', [
        'postgres=X/postgres',
        'authenticated=X/postgres',
        '"odd role"=/postgres'.replace('"odd role"', 'service_role'),
      ]),
      fn('changed_fn', ['postgres=X/postgres', 'service_role=X/postgres']),
      fn('bill_thing', ['postgres=X/postgres']),
    ],
  };
}

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? Mutable<U>[] : Mutable<T[K]>;
};
const clone = <T>(value: T): Mutable<T> => structuredClone(value) as Mutable<T>;

describe('the cut', () => {
  const result = cutBaseline(dump(), allowlist());
  const tables = result.files['0002_tables.sql'] ?? '';
  const functions = result.files['0003_functions.sql'] ?? '';
  const rules = result.files['0006_views_triggers_policies.sql'] ?? '';
  const grants = result.files['0007_grants.sql'] ?? '';
  const storage = result.files['0008_storage_and_realtime.sql'] ?? '';

  it('writes the tables that are in, without the columns, defaults and constraints that are out', () => {
    expect(tables).toContain('create table public.things (');
    expect(tables).toContain('create table public.owners (');
    expect(tables).not.toContain('secret_stuff');
    expect(tables).not.toContain('billing_code');
    expect(tables).toContain('  kind text,');
    expect(tables).not.toContain('church');
    expect(tables).toContain('  "Odd Name" bigint default nextval(\'things_seq\'::regclass)');
    expect(tables).toContain('create sequence public.things_seq as bigint;');
    expect(tables).toContain('alter sequence public.things_seq owned by public.things."Odd Name";');
    expect(tables).toContain('alter table public.things replica identity full;');
    expect(tables).toContain("add constraint things_kind_check CHECK (kind ~ '^[a-z]+$'::text);");
    expect(tables).not.toContain('things_name_key');
    expect(tables).toContain('CREATE INDEX things_name_idx ON public.things USING btree (name);');
    expect(tables).not.toContain('things_pkey ON');
    // Foreign keys come after every table exists.
    expect(tables.indexOf('things_owner_fkey')).toBeGreaterThan(tables.indexOf('-- foreign keys'));
    expect(
      tables
        .trimEnd()
        .endsWith(
          "insert into engine.schema_migrations (version, name) values ('0002', 'tables');",
        ),
    ).toBe(true);
  });

  it('writes the as-is functions exactly, with unix line endings, and leaves the others out', () => {
    expect(functions).toContain(
      'CREATE OR REPLACE FUNCTION public.count_things()\n RETURNS integer',
    );
    expect(functions).not.toContain('\r');
    expect(functions).toContain('$function$;');
    expect(functions).not.toContain('changed_fn');
    expect(functions).not.toContain('bill_thing');
    expect(functions).toContain('set check_function_bodies = off;');
  });

  it('writes views, the triggers that stay, row security and policies', () => {
    expect(rules).toContain('create view public.things_view with (security_invoker=on) as');
    expect(rules).toContain('FROM things;');
    expect(rules).toContain('CREATE TRIGGER on_new AFTER INSERT ON auth.users');
    expect(rules).not.toContain('trg_bill');
    expect(rules).toContain('alter table public.things enable row level security;');
    expect(rules).toContain(
      'create policy "things read" on public.things\n  as permissive for select to public\n  using (true);',
    );
    expect(rules).toContain(
      'create policy things_write on public.things\n  as restrictive for insert to authenticated\n  with check ((owner_id = auth.uid()));',
    );
  });

  it('states every grant, and trims what a data API role never needs', () => {
    // anon had SELECT and TRUNCATE: it keeps SELECT.
    expect(grants).toContain(
      'revoke all on table public.things from public, anon, authenticated, service_role;',
    );
    expect(grants).toContain('grant select on table public.things to anon;');
    expect(grants).toContain(
      'grant select, insert, update, delete on table public.things to authenticated;',
    );
    expect(grants).toContain('grant all on table public.things to service_role;');
    // A table only one writer may change: the signed-in role keeps SELECT only.
    expect(grants).toContain('grant select on table public.owners to authenticated;');
    expect(grants).toContain('grant select (id) on table public.owners to anon, authenticated;');
    expect(grants).toContain('grant update (email) on table public.owners to authenticated;');
    // A view is read-only for the data API roles; a role that could not read it gets nothing.
    expect(grants).toContain('grant select on table public.things_view to anon;');
    expect(grants).not.toContain('public.things_view to anon, authenticated');
    expect(grants).toContain('grant all on sequence public.things_seq to anon;');
    expect(grants).toContain('grant usage on sequence public.things_seq to authenticated;');
    expect(grants).toContain('grant execute on function public.count_things() to public, anon;');
    expect(grants).toContain('grant execute on function public.changed_fn() to service_role;');
    expect(grants).toContain(
      'revoke all on function public.is_owner() from public, anon, authenticated, service_role;',
    );
  });

  it('writes the buckets, their rules and the realtime tables that are in', () => {
    expect(storage).toContain("values ('pics', 'pics', true, 1000, array['image/png'])");
    expect(storage).not.toContain('other-pics');
    expect(storage).toContain('create policy "Pics upload" on storage.objects');
    expect(storage).toContain('alter publication supabase_realtime add table public.things;');
  });

  it('says what a built database must contain', () => {
    expect(result.expected.tables).toEqual(['owners', 'things']);
    expect(result.expected.columns.things).toEqual(['id', 'name', 'kind', 'owner_id', 'Odd Name']);
    expect(result.expected.functions).toEqual(['count_things()', 'is_owner()']);
    expect(result.expected.changedFunctions).toEqual(['changed_fn']);
    expect(result.expected.triggers).toEqual(['auth.users.on_new', 'things.trg_things']);
    expect(result.expected.policies).toEqual({ things: 2 });
    expect(result.expected).toMatchObject({
      indexes: 1,
      constraints: 4,
      anonExecutable: ['count_things'],
      publicExecutable: ['count_things'],
    });
  });

  it('gives files the leak check accepts', () => {
    const leakRules = allowlist();
    for (const [file, sql] of Object.entries(result.files)) {
      expect(findLeaks(file, sql, leakRules), file).toEqual([]);
    }
  });

  it('accepts a bucket without a size limit or a type list', () => {
    const other = clone(dump());
    other.buckets[0] = { id: 'pics', name: 'pics', public: false, limit: null, mime: null };
    expect(
      cutBaseline(other as Dump, allowlist()).files['0008_storage_and_realtime.sql'],
    ).toContain("values ('pics', 'pics', false, null, null)");
  });
});

describe('the cut refuses', () => {
  type Change = (d: Mutable<Dump>, a: Mutable<Allowlist>) => void;
  const cases: [string, Change, RegExp][] = [
    [
      'a table nobody listed',
      (d) => d.tables.push({ ...d.tables[1]!, name: 'surprise' }),
      /Not in the allow-list.*table surprise/,
    ],
    [
      'a function nobody listed',
      (d) => d.functions.push({ ...d.functions[0]!, n: 'surprise' }),
      /function surprise/,
    ],
    [
      'a view nobody listed',
      (d) => d.views.push({ ...d.views[0]!, n: 'surprise' }),
      /view surprise/,
    ],
    [
      'a trigger nobody listed',
      (d) => d.triggers.push({ ...d.triggers[0]!, n: 'surprise' }),
      /trigger things\.surprise/,
    ],
    [
      'a listed name the dump does not have',
      (_d, a) => a.tables.engine.push('ghost'),
      /names "ghost"/,
    ],
    [
      'a listed constraint the dump does not have',
      (_d, a) => (a.constraints.dropped.ghost_check = 'x'),
      /constraint "ghost_check"/,
    ],
    [
      'a function that reads a cut table',
      (d) => (d.functions[0]!.def = 'select count(*) from secret_stuff'),
      /mentions secret_stuff/,
    ],
    [
      'a function that reads a sibling schema',
      (d) => (d.functions[0]!.def = 'select 1 from wear.brands'),
      /reads wear\.\*/,
    ],
    [
      'a policy that reads a cut column',
      (d) => (d.policies[0]!.using = '(billing_code IS NULL)'),
      /mentions billing_code|reads a cut column/,
    ],
    ['an identity column', (d) => (d.tables[0]!.cols[0]!.id = 'a'), /identity or generated/],
    ['a table with row security off', (d) => (d.tables[0]!.rls = false), /row security off/],
    [
      'a table that forces row security',
      (d) => (d.tables[0]!.force_rls = true),
      /forces row security/,
    ],
    ['an unusual replica identity', (d) => (d.tables[0]!.replident = 'n'), /replica identity n/],
    [
      'a foreign key to a cut table',
      (d) => (d.constraints[4]!.def = 'FOREIGN KEY (owner_id) REFERENCES secret_stuff(id)'),
      /secret_stuff/,
    ],
    [
      'a view that runs with its owner’s rights',
      (d) => (d.views[0]!.options = null),
      /not security_invoker/,
    ],
    ['a disabled trigger', (d) => (d.triggers[0]!.enabled = 'D'), /ordinary state/],
    ['an unknown policy command', (d) => (d.policies[0]!.cmd = 'z'), /unknown command z/],
    ['an unknown storage policy command', (d) => (d.policies[3]!.cmd = 'z'), /unknown command z/],
    [
      'a grant to a role it does not know',
      (d) => d.tables[0]!.acl!.push('stranger=r/postgres'),
      /grant for "stranger"/,
    ],
    [
      'a table open to every role',
      (d) => d.tables[0]!.acl!.push('=r/postgres'),
      /grants to PUBLIC/,
    ],
    [
      'a privilege letter it does not know',
      (d) => (d.tables[0]!.acl![1] = 'anon=rZ/postgres'),
      /Unknown table privilege "Z"/,
    ],
    [
      'a column grant it does not handle',
      (d) => (d.tables[1]!.cols[0]!.acl = ['anon=x/postgres']),
      /Column grant x/,
    ],
    [
      'a sequence privilege it does not know',
      (d) => (d.seq_owned[0]!.acl = ['anon=Z/postgres']),
      /Unknown sequence privilege/,
    ],
    [
      'a sequence without an engine table',
      (d) => (d.seq_owned[0]!.tbl = 'secret_stuff'),
      /has no engine table/,
    ],
    [
      'a function with only the built-in grants',
      (d) => (d.functions[0]!.acl = null),
      /no stated grants/,
    ],
    ['an aggregate or a procedure', (d) => (d.functions[0]!.kind = 'a'), /not a plain function/],
    [
      'a function owned by someone else',
      (d) => (d.functions[0]!.owner = 'someone'),
      /owned by someone/,
    ],
    [
      'a bucket nobody listed',
      (d) => d.buckets.push({ id: 'new', name: 'new', public: true, limit: null, mime: null }),
      /Bucket new/,
    ],
    [
      'a storage rule that names no bucket',
      (d) => (d.policies[3]!.check = 'true'),
      /names no bucket/,
    ],
    [
      'a storage rule for an unknown bucket',
      (d) => (d.policies[3]!.check = "(bucket_id = 'new'::text)"),
      /unknown bucket new/,
    ],
    [
      'a realtime table nobody listed',
      (d) => d.publication.push('public.owners'),
      /published for realtime/,
    ],
  ];

  it.each(cases)('%s', (_what, change, message) => {
    const d = clone(dump());
    const a = clone(allowlist());
    change(d, a);
    expect(() => cutBaseline(d as Dump, a as Allowlist)).toThrow(message);
  });

  it('a grant it cannot read', () => {
    expect(() => parseAcl(['nonsense'])).toThrow(/Cannot read the grant/);
    expect(parseAcl(null)).toEqual([]);
    expect(parseAcl(['"odd role"=r*w/postgres', '=X/postgres'])).toEqual([
      { grantee: 'odd role', privileges: 'rw' },
      { grantee: '', privileges: 'X' },
    ]);
  });
});
