import { describe, expect, it } from 'vitest';
import {
  AMBIGUOUS_COLUMNS,
  citizensOnlyFunctions,
  deniedColumns,
  deniedNames,
  loadAllowlist,
} from '../src/allowlist.ts';
import { describeLeak, findLeaks } from '../src/leaks.ts';
import { listMigrations } from '../src/migrations.ts';
import { scanSql, topLevelCode } from '../src/sql-scan.ts';

const allowlist = loadAllowlist();
const rulesOf = (sql: string) =>
  findLeaks('test.sql', sql, allowlist).map((finding) => finding.rule);

describe('the SQL scanner', () => {
  it('tells code, strings, comments and quoted names apart', () => {
    const segments = scanSql(
      `select 'it''s' as "my ""col""" -- a note\nfrom t /* block /* nested */ end */;`,
    );
    const seen = segments
      .map((segment) => [segment.kind, segment.text.trim()])
      .filter(([kind, text]) => kind !== 'code' || text !== '');
    expect(seen).toEqual([
      ['code', 'select'],
      ['string', "it's"],
      ['code', 'as'],
      ['identifier', 'my "col"'],
      ['comment', 'a note'],
      ['code', 'from t'],
      ['comment', 'block /* nested */ end'],
      ['code', ';'],
    ]);
  });

  it('reads a function body one level deeper, with the right line numbers', () => {
    const sql = [
      'create function f() returns text',
      'language sql as $body$',
      "  select 'inside';",
      '$body$;',
      "select 'outside';",
    ].join('\n');
    const strings = scanSql(sql).filter((segment) => segment.kind === 'string');
    expect(strings).toEqual([
      { kind: 'string', text: 'inside', line: 3, depth: 1 },
      { kind: 'string', text: 'outside', line: 5, depth: 0 },
    ]);
    expect(topLevelCode(sql)).not.toContain('select \n');
  });

  it('handles backslash escapes only in an E string, and a dollar that is not a quote', () => {
    const escaped = scanSql(String.raw`select E'a\'b', 'c\', $1, price$tag`);
    expect(
      escaped.filter((segment) => segment.kind === 'string').map((segment) => segment.text),
    ).toEqual([String.raw`a\'b`, 'c\\']);
    expect(escaped.at(-1)?.text).toContain('$1, price$tag');
  });

  it('copes with text that ends inside a quote, a comment or a body', () => {
    expect(scanSql("select 'open").at(-1)).toMatchObject({ kind: 'string', text: 'open' });
    expect(scanSql('select "open').at(-1)).toMatchObject({ kind: 'identifier', text: 'open' });
    expect(scanSql('select /* open').at(-1)).toMatchObject({ kind: 'comment', text: ' open' });
    expect(scanSql('do $$ begin').at(-1)).toMatchObject({ kind: 'code', depth: 1 });
    expect(scanSql('-- only a comment')).toEqual([
      { kind: 'comment', text: ' only a comment', line: 1, depth: 0 },
    ]);
  });
});

describe('the allow-list', () => {
  it('counts what the boundary inventory counted, with the two additions E5 found', () => {
    expect(allowlist.tables.engine).toHaveLength(69);
    expect(Object.keys(allowlist.tables.citizensOnly)).toHaveLength(10);
    expect(allowlist.functions.engine).toHaveLength(95);
    expect(Object.keys(allowlist.functions.changed)).toHaveLength(15);
    expect(citizensOnlyFunctions(allowlist)).toHaveLength(29);
    expect(
      allowlist.scheduledJobs.engine.length + Object.keys(allowlist.scheduledJobs.changed).length,
    ).toBe(8);
    expect(allowlist.scheduledJobs.citizensOnly).toHaveLength(7);
    expect(allowlist.edgeFunctions.changed).toHaveLength(13);
  });

  it('never lists a name on both sides', () => {
    const engine = new Set([
      ...allowlist.tables.engine,
      ...allowlist.functions.engine,
      ...Object.keys(allowlist.functions.changed),
      ...allowlist.views.engine,
      ...allowlist.scheduledJobs.engine,
      ...allowlist.storageBuckets.engine,
    ]);
    expect(deniedNames(allowlist).filter((name) => engine.has(name))).toEqual([]);
  });

  it('checks an everyday column name in the catalogue instead of in text', () => {
    expect(deniedNames(allowlist)).not.toContain('timezone');
    expect([...AMBIGUOUS_COLUMNS]).toEqual(['timezone']);
    expect(deniedColumns(allowlist)).toContain('profiles.timezone');
    expect(deniedColumns(allowlist)).toHaveLength(10);
  });
});

describe('the leak check', () => {
  it('finds nothing in the engine migration files', () => {
    const findings = listMigrations().flatMap((migration) =>
      findLeaks(migration.file, migration.sql, allowlist),
    );
    expect(findings.map(describeLeak)).toEqual([]);
  });

  it('lets internal names through', () => {
    expect(
      rulesOf(`
        -- the role value 'citizen' and the contributor columns are internal names
        update public.profiles set role = 'citizen', contributor_status = 'approved' where contributor_slug is null;
        select public.schedule_kingdom_project(null, null), public.admin_delete_citizen_account(null);
        create policy "Contributors manage own locations" on public.contributor_locations for all using (true);
        raise exception 'contributor_status transition % -> % is not allowed.', 1, 2;
      `),
    ).toEqual([]);
  });

  it.each([
    ['a table that stays out', 'select * from public.api_keys;', 'name-that-stays-out'],
    ['a function that stays out', 'select public.resolve_api_key($1);', 'name-that-stays-out'],
    ['a cut column', 'select billing_tier from public.profiles;', 'name-that-stays-out'],
    [
      'a cut name inside a comment',
      '-- listing_sources used to be here\nselect 1;',
      'name-that-stays-out',
    ],
    ['a cut bucket', "select 'wear-media';", 'name-that-stays-out'],
    ['a sibling schema', 'select 1 from wear.brands;', 'sibling-schema'],
    ['a sibling schema', 'select vision.run_daily_snapshots();', 'sibling-schema'],
    ['a framing sentence', "select 'Welcome to the Kingdom.';", 'framing-word'],
    [
      'a framing sentence in lower case',
      "raise exception 'citizens may create one event';",
      'framing-word',
    ],
    ['a framing word in a comment', '-- Contributors only\nselect 1;', 'framing-word'],
    ['a sibling app in a sentence', "select 'created an organisation in Vision';", 'sibling-app'],
    ['content of the source world', "select 'church-services';", 'source-content'],
    ['an address', "select 'https://abcdefgh.supabase.co/functions/v1/x';", 'address'],
    ['an email address', "select 'someone@example.org';", 'email-address'],
    ['a key', "select 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';", 'key'],
    ['seed data', "insert into public.categories (name, slug) values ('A', 'a');", 'seed-data'],
    ['seed data by copy', 'copy public.provinces from stdin;', 'seed-data'],
  ])('catches %s', (_what, sql, rule) => {
    expect(rulesOf(sql)).toContain(rule);
  });

  it('does not call an insert inside a function body seed data', () => {
    expect(
      rulesOf(`create function public.f() returns void language sql as $$ insert into public.notifications (user_id) values (null) $$;
               insert into engine.schema_migrations (version, name) values ('0001', 'x');`),
    ).toEqual([]);
  });

  it('reports the line a leak is on', () => {
    const [finding] = findLeaks(
      'm.sql',
      "select 1;\nselect 2;\nselect 'Welcome to the\nKingdom';",
      allowlist,
    );
    expect(finding).toMatchObject({
      file: 'm.sql',
      line: 4,
      rule: 'framing-word',
      match: 'Kingdom',
    });
    expect(describeLeak(finding!)).toBe('m.sql:4 framing-word: "Kingdom"');
  });
});
