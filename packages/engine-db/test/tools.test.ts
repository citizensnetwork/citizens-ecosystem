import { describe, expect, it } from 'vitest';
import { sampleConfiguration, sampleEntitlements, validateConfiguration } from '@engine/config';
import { loadAllowlist } from '../src/allowlist.ts';
import {
  catalogueCheckSql,
  expectedCatalogue,
  loadBaselineLock,
  loadEngineObjects,
} from '../src/checks.ts';
import {
  checkDrift,
  checkDriftOnDisk,
  engineObjectsTouched,
  loadLedger,
  type DriftLedger,
} from '../src/drift.ts';
import {
  assertRunsLocally,
  createManagementClient,
  describeReport,
  fanOut,
  parseTargets,
  type ManagementClient,
} from '../src/fanout.ts';
import {
  buildLock,
  compareWithLock,
  listMigrations,
  readLock,
  recordsItself,
  sha256,
  type EngineMigration,
} from '../src/migrations.ts';
import { describePlan, provisioningPlan, sqlLiteral } from '../src/provision.ts';
import { buildPublishPayload } from '../src/wording.ts';

const allowlist = loadAllowlist();
const migrations = listMigrations();

describe('the migration files and their lock', () => {
  it('are numbered without a gap and each records itself in the ledger', () => {
    expect(migrations.map((migration) => migration.version)).toEqual(
      migrations.map((_, index) => String(index + 1).padStart(4, '0')),
    );
    expect(migrations.filter((migration) => !recordsItself(migration)).map((m) => m.file)).toEqual(
      [],
    );
  });

  it('match the lock: an applied migration never changes', () => {
    expect(compareWithLock(migrations, readLock())).toEqual([]);
  });

  it('notice a changed file, a new file and a missing file', () => {
    const lock = buildLock(migrations);
    const first = migrations[0] as EngineMigration;
    const edited = [
      { ...first, sha256: sha256(`${first.sql}\n-- edited`) },
      ...migrations.slice(1),
    ];
    expect(compareWithLock(edited, lock)).toEqual([{ file: first.file, problem: 'changed' }]);
    expect(compareWithLock(migrations, { files: {} })).toHaveLength(migrations.length);
    expect(compareWithLock(migrations.slice(1), lock)).toEqual([
      { file: first.file, problem: 'missing' },
    ]);
  });

  it('hash the same whatever the line endings', () => {
    expect(sha256('a\r\nb\r\n')).toBe(sha256('a\nb\n'));
  });
});

describe('the catalogue check', () => {
  const lock = loadBaselineLock();
  const engine = loadEngineObjects();
  const expected = expectedCatalogue(lock, allowlist, engine);

  it('expects the cut, the changed functions and what the engine line adds', () => {
    expect(expected.tables).toHaveLength(72);
    expect(expected.functions).toHaveLength(95 + 15 + engine.functions.length);
    expect(expected.functions).toContain('publish_engine_configuration');
    expect(expected.jobs).toHaveLength(8);
    expect(expected.anonExecutable).toContain('engine_feature_on');
    expect(expected.anonExecutable).not.toContain('publish_engine_configuration');
  });

  it('is written as one statement that names every list', () => {
    const sql = catalogueCheckSql(lock, allowlist, engine, migrations);
    expect(sql).toContain("'engine_wording'");
    expect(sql).toContain("'profiles.timezone'");
    expect(sql).toContain("'0010'");
    expect(sql.match(/do \$catalogue\$/g)).toHaveLength(1);
    // An empty list is still valid SQL.
    expect(catalogueCheckSql(lock, allowlist, { ...engine, publicExecutable: [] }, [])).toContain(
      'v_versions constant text[] := array[]::text[];',
    );
  });
});

describe('the drift check between the two lines', () => {
  const engineMigrations = migrations.map((migration) => migration.file);
  const base: DriftLedger = { baselineFiles: ['001_first.sql'], after: {} };
  const run = (ledger: DriftLedger, files: Record<string, string>) =>
    checkDrift({ ledger, allowlist, citizensMigrations: files, engineMigrations });

  it('passes for the repository as it is', () => {
    const report = checkDriftOnDisk({ allowlist, engineMigrations });
    expect(report.problems).toEqual([]);
    expect(loadLedger().baselineFiles).toContain('202_lets_gatherings.sql');
  });

  it('fails for a new Citizens migration nobody decided about, and says what it touches', () => {
    const report = run(base, {
      '001_first.sql': '',
      '203_new.sql':
        'alter table public.events add column note text; -- profiles in a comment does not count',
    });
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]?.problem).toMatch(
      /no entry.*names events, which the engine line also has/s,
    );
    expect(engineObjectsTouched("select 'events' from public.api_keys", allowlist)).toEqual([]);
  });

  it('accepts each verdict when it is complete', () => {
    const files = {
      '001_first.sql': '',
      '203_a.sql': 'select 1;',
      '204_b.sql': 'select 1;',
      '205_c.sql': 'select 1;',
    };
    const report = run(
      {
        ...base,
        after: {
          '203_a.sql': { verdict: 'citizens-only', reason: 'A feed table for a sibling app only.' },
          '204_b.sql': { verdict: 'twinned', engineMigration: engineMigrations[0] as string },
          '205_c.sql': { verdict: 'not-yet', reason: 'Waits for the next engine release.' },
        },
      },
      files,
    );
    expect(report.problems).toEqual([]);
    expect(report.warnings.map((warning) => warning.file)).toEqual(['205_c.sql']);
  });

  it('refuses an incomplete or stale entry', () => {
    const report = run(
      {
        baselineFiles: ['001_first.sql', '002_gone.sql'],
        after: {
          '001_first.sql': {
            verdict: 'citizens-only',
            reason: 'Listed twice, which is a mistake.',
          },
          '203_a.sql': { verdict: 'citizens-only' },
          '204_b.sql': { verdict: 'twinned', engineMigration: '9999_nope.sql' },
          '205_c.sql': { verdict: 'not-yet', reason: '' },
          '206_d.sql': { verdict: 'whatever' as never },
          '207_gone.sql': { verdict: 'citizens-only', reason: 'The file was deleted afterwards.' },
        },
      },
      {
        '001_first.sql': '',
        '203_a.sql': 'select 1;',
        '204_b.sql': '',
        '205_c.sql': '',
        '206_d.sql': '',
      },
    );
    expect(report.problems.map((problem) => problem.file).sort()).toEqual([
      '001_first.sql',
      '002_gone.sql',
      '203_a.sql',
      '204_b.sql',
      '205_c.sql',
      '206_d.sql',
      '207_gone.sql',
    ]);
  });
});

describe('the publish payload', () => {
  it('carries the document and the world’s wording for the database and the edge functions', () => {
    const checked = validateConfiguration(sampleConfiguration, sampleEntitlements);
    expect(checked.ok).toBe(true);
    const payload = buildPublishPayload(sampleConfiguration, sampleEntitlements);
    expect(payload.document).toBe(sampleConfiguration);
    expect(payload.wording.database['notification.followedPartner.fallbackName']).toBe(
      'a host you follow',
    );
    expect(payload.wording.edge['notification.nearbyRsvp']).toBe(
      'A few neighbours near you just RSVPed.',
    );
    // A feature that is off sends no wording; the database then falls back to the engine default.
    expect(Object.keys(payload.wording.database)).not.toContain('notification.ideaLead.body');
  });
});

describe('the provisioning plan', () => {
  const input = {
    projectUrl: 'https://abcdefghijklmnopqrst.example',
    publishableKey: 'publishable-key-for-tests',
    siteUrl: 'https://world.example',
    entitlements: sampleEntitlements,
  };

  it('covers what SQL alone does not, and never copies an address', () => {
    const plan = provisioningPlan(input, allowlist);
    const ids = plan.map((step) => step.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'project',
        'schema',
        'entitlements',
        'project-settings',
        'sign-in',
        'secrets',
        'configuration',
        'first-staff',
        'prove',
      ]),
    );
    expect(plan.filter((step) => step.kind === 'blocked')).toHaveLength(13);
    const settings = plan.find((step) => step.id === 'project-settings');
    expect(settings?.sql).toContain(
      "('functions_url', 'https://abcdefghijklmnopqrst.example/functions/v1')",
    );
    expect(plan.find((step) => step.id === 'entitlements')?.sql).toContain('"schemaLine":"engine"');
    expect(describePlan(plan)).toMatch(/^ 1\. \[founder\] Create the project/);
  });

  it('refuses a secret key, an address with a path, and a missing key', () => {
    expect(() =>
      provisioningPlan({ ...input, publishableKey: 'sb_secret_abc' }, allowlist),
    ).toThrow(/secret key/);
    expect(() => provisioningPlan({ ...input, publishableKey: ' ' }, allowlist)).toThrow(/missing/);
    expect(() =>
      provisioningPlan({ ...input, siteUrl: 'https://world.example/x' }, allowlist),
    ).toThrow(/site address/);
    expect(() =>
      provisioningPlan({ ...input, projectUrl: 'http://plain.example' }, allowlist),
    ).toThrow(/project address/);
  });

  it('quotes text for SQL', () => {
    expect(sqlLiteral("it's")).toBe("'it''s'");
  });
});

describe('fan-out', () => {
  const ENGINE_ORG = 'engine-organisation';
  const two = migrations.slice(0, 2);

  /** A stand-in for the platform: each project is a small record the fake SQL calls read and write. */
  function fakePlatform(
    projects: Record<
      string,
      {
        org: string;
        versions: string[];
        tables?: number;
        siblings?: string[];
        fingerprint?: string;
        failOn?: string;
      }
    >,
  ) {
    const calls: string[] = [];
    const client: ManagementClient = {
      async getProject(ref) {
        const project = projects[ref];
        if (!project) throw new Error('no such project');
        return { ref, organizationId: project.org, name: ref, region: 'eu-central-1' };
      },
      async runSql(ref, sql) {
        const project = projects[ref]!;
        calls.push(`${ref}: ${sql.slice(0, 40).replaceAll('\n', ' ')}`);
        if (sql.startsWith('select\n  (to_regclass')) {
          return [
            {
              has_ledger: project.versions.length > 0,
              public_tables: project.tables ?? (project.versions.length > 0 ? 72 : 0),
              sibling_schemas: project.siblings ?? [],
            },
          ];
        }
        if (sql.startsWith('select version from'))
          return project.versions.map((version) => ({ version }));
        if (sql.startsWith('begin;')) {
          const migration = two.find((candidate) => sql.includes(candidate.sql));
          if (!migration) throw new Error('unknown migration');
          if (project.failOn === migration.version)
            throw new Error('syntax error at or near "oops"');
          project.versions.push(migration.version);
          return [];
        }
        if (sql.startsWith('select 1 as ok')) {
          return project.versions.some((version) => sql.includes(`'${version}'`))
            ? [{ ok: 1 }]
            : [];
        }
        if (sql.startsWith('select hash from'))
          return [{ hash: project.fingerprint ?? `fp-${project.versions.join('')}` }];
        if (sql === 'CHECK') return [];
        throw new Error(`unexpected SQL: ${sql.slice(0, 60)}`);
      },
    };
    return { client, calls, projects };
  }

  const options = (platform: ReturnType<typeof fakePlatform>, apply: boolean, refs: string[]) => ({
    client: platform.client,
    targets: refs.map((ref) => ({ name: `world ${ref}`, ref })),
    migrations: two,
    rule: { engineOrganizationId: ENGINE_ORG, forbiddenOrganizationIds: ['other-organisation'] },
    apply,
    checks: [{ name: 'catalogue', sql: 'CHECK' }],
    env: {},
  });

  it('only plans unless told to apply', async () => {
    const platform = fakePlatform({ aaaaaaaaaaaaaaaaaaaa: { org: ENGINE_ORG, versions: [] } });
    const report = await fanOut(options(platform, false, ['aaaaaaaaaaaaaaaaaaaa']));
    expect(report.targets[0]).toMatchObject({
      headBefore: null,
      headAfter: null,
      applied: [],
      pending: ['0001', '0002'],
      checks: 'not-run',
    });
    expect(platform.calls.some((call) => call.includes('begin;'))).toBe(false);
  });

  it('applies what is missing, in order, runs the checks and reports one fingerprint', async () => {
    const platform = fakePlatform({
      aaaaaaaaaaaaaaaaaaaa: { org: ENGINE_ORG, versions: [] },
      bbbbbbbbbbbbbbbbbbbb: { org: ENGINE_ORG, versions: ['0001'] },
    });
    const lines: string[] = [];
    const report = await fanOut({
      ...options(platform, true, ['aaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbb']),
      log: (line) => lines.push(line),
    });
    expect(report.stoppedAt).toBeNull();
    expect(report.inStep).toBe(true);
    expect(
      report.targets.map((target) => [target.applied, target.headAfter, target.checks]),
    ).toEqual([
      [['0001', '0002'], '0002', 'passed'],
      [['0002'], '0002', 'passed'],
    ]);
    expect(lines.filter((line) => line.includes('applying'))).toHaveLength(3);
    expect(describeReport(report)).toMatch(
      /Every project on the newest migration has the same schema\.$/,
    );
  });

  it('stops at the first failure and leaves the next project alone', async () => {
    const platform = fakePlatform({
      aaaaaaaaaaaaaaaaaaaa: { org: ENGINE_ORG, versions: [], failOn: '0002' },
      bbbbbbbbbbbbbbbbbbbb: { org: ENGINE_ORG, versions: [] },
    });
    const report = await fanOut(
      options(platform, true, ['aaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbb']),
    );
    expect(report.stoppedAt).toMatchObject({ name: 'world aaaaaaaaaaaaaaaaaaaa' });
    expect(report.targets).toHaveLength(1);
    expect(report.targets[0]).toMatchObject({
      applied: ['0001'],
      pending: ['0002'],
      headAfter: '0001',
    });
    expect(platform.projects.bbbbbbbbbbbbbbbbbbbb?.versions).toEqual([]);
    expect(report.inStep).toBe(false);
    expect(describeReport(report)).toMatch(/STOPPED at world a.*DRIFT/s);
  });

  it('reports drift when two projects on the same migration differ', async () => {
    const platform = fakePlatform({
      aaaaaaaaaaaaaaaaaaaa: { org: ENGINE_ORG, versions: ['0001', '0002'] },
      bbbbbbbbbbbbbbbbbbbb: {
        org: ENGINE_ORG,
        versions: ['0001', '0002'],
        fingerprint: 'someone-changed-something',
      },
    });
    const report = await fanOut(
      options(platform, false, ['aaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbb']),
    );
    expect(report.inStep).toBe(false);
  });

  it.each([
    [
      'a project in another organisation',
      { org: 'somewhere-else', versions: [] },
      /not in the engine organisation/,
    ],
    [
      'a project in a forbidden organisation',
      { org: 'other-organisation', versions: [] },
      /must never touch/,
    ],
    [
      'a database with a sibling app in it',
      { org: ENGINE_ORG, versions: [], siblings: ['wear'] },
      /not an engine project/,
    ],
    [
      'a database with tables but no ledger',
      { org: ENGINE_ORG, versions: [], tables: 79 },
      /not an empty project/,
    ],
    ['a database with an unknown history', { org: ENGINE_ORG, versions: ['0007'] }, /not a prefix/],
  ])('refuses %s before changing anything', async (_what, project, message) => {
    const platform = fakePlatform({
      aaaaaaaaaaaaaaaaaaaa: { org: ENGINE_ORG, versions: [] },
      bbbbbbbbbbbbbbbbbbbb: project,
    });
    await expect(
      fanOut(options(platform, true, ['aaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbb'])),
    ).rejects.toThrow(message);
    // The good project that came first in the list was not touched either.
    expect(platform.projects.aaaaaaaaaaaaaaaaaaaa?.versions).toEqual([]);
  });

  it('refuses to run in CI, and without an organisation', async () => {
    expect(() => assertRunsLocally({ CI: 'true' })).toThrow(/does not run in CI/);
    expect(() => assertRunsLocally({ GITHUB_ACTIONS: 'true' })).toThrow(/does not run in CI/);
    expect(() => assertRunsLocally({})).not.toThrow();
    const platform = fakePlatform({ aaaaaaaaaaaaaaaaaaaa: { org: ENGINE_ORG, versions: [] } });
    await expect(
      fanOut({ ...options(platform, false, ['aaaaaaaaaaaaaaaaaaaa']), env: { CI: '1' } }),
    ).rejects.toThrow(/CI/);
    await expect(
      fanOut({
        ...options(platform, false, ['aaaaaaaaaaaaaaaaaaaa']),
        rule: { engineOrganizationId: ' ' },
      }),
    ).rejects.toThrow(/which organisation/);
  });

  it('reads a tenant list and refuses a malformed one', () => {
    expect(parseTargets('[{"name": "one", "ref": "aaaaaaaaaaaaaaaaaaaa"}]')).toEqual([
      { name: 'one', ref: 'aaaaaaaaaaaaaaaaaaaa' },
    ]);
    expect(() => parseTargets('{}')).toThrow(/must be a list/);
    expect(() => parseTargets('[{"name": "one", "ref": "NOT A REF"}]')).toThrow(/Entry 1/);
    expect(() => parseTargets('[null]')).toThrow(/Entry 1/);
  });

  it('talks to the platform with the token, and reports a refusal', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const fakeFetch = (async (url: URL | string, init?: RequestInit) => {
      seen.push({ url: String(url), init });
      if (String(url).endsWith('/database/query'))
        return new Response(JSON.stringify([{ ok: 1 }]), { status: 201 });
      if (String(url).includes('cccccccccccccccccccc'))
        return new Response('nope', { status: 403 });
      return new Response(JSON.stringify({ organization_id: 'org', name: 'n', region: 'r' }), {
        status: 200,
      });
    }) as typeof fetch;
    const client = createManagementClient('token-for-tests', fakeFetch);
    expect(await client.getProject('aaaaaaaaaaaaaaaaaaaa')).toEqual({
      ref: 'aaaaaaaaaaaaaaaaaaaa',
      organizationId: 'org',
      name: 'n',
      region: 'r',
    });
    expect(await client.runSql('aaaaaaaaaaaaaaaaaaaa', 'select 1')).toEqual([{ ok: 1 }]);
    expect(seen[1]?.init?.body).toBe('{"query":"select 1"}');
    expect((seen[0]?.init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer token-for-tests',
    );
    await expect(client.getProject('cccccccccccccccccccc')).rejects.toThrow(/answered 403/);
    await expect(client.getProject('../etc')).rejects.toThrow(/not a project reference/);
    expect(() => createManagementClient(' ')).toThrow(/token/);
  });
});
