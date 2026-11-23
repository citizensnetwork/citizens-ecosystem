/**
 * Fan-out: one engine migration line, every tenant project.
 *
 * For each tenant, in order: check that the project really is an engine project, read which
 * migrations it has, apply the ones it lacks (each in its own transaction), run the catalogue and
 * security checks, and read the schema fingerprint. It stops at the first failure and never
 * carries on by itself. The report says, per tenant, where its schema stands, and whether every
 * tenant on the same migration has the same fingerprint (the drift report).
 *
 * It never runs in this repository's workflows: the repository is public, so its logs are, and
 * they would show which projects are tenants. `assertRunsLocally` refuses when it sees CI.
 * The tenant list is given at run time (later: read from the control plane); it is never a file
 * in this repository.
 */

import type { EngineMigration } from './migrations.ts';

/* ── The two calls the tool needs from the platform ──────────────────── */

export interface ProjectInfo {
  readonly ref: string;
  readonly organizationId: string;
  readonly name: string;
  readonly region: string;
}

export interface ManagementClient {
  getProject(ref: string): Promise<ProjectInfo>;
  /** Runs SQL as the database owner and returns the rows of the last statement. */
  runSql(ref: string, sql: string): Promise<readonly Record<string, unknown>[]>;
}

export const MANAGEMENT_API = 'https://api.supabase.com';
const PROJECT_REF_RE = /^[a-z0-9]{16,32}$/;

/** A client for the platform's management API. The token comes from the caller's environment. */
export function createManagementClient(
  token: string,
  fetchImpl: typeof fetch = fetch,
): ManagementClient {
  if (token.trim() === '') throw new Error('An access token is needed.');
  const call = async (path: string, init?: RequestInit): Promise<unknown> => {
    const response = await fetchImpl(new URL(path, MANAGEMENT_API), {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      // The body may repeat the SQL that failed; it is shown to the operator, never logged elsewhere.
      throw new Error(
        `The platform answered ${response.status} for ${path}: ${(await response.text()).slice(0, 2000)}`,
      );
    }
    return response.json();
  };
  const checked = (ref: string) => {
    if (!PROJECT_REF_RE.test(ref)) throw new Error('That is not a project reference.');
    return ref;
  };
  return {
    async getProject(ref) {
      const body = (await call(`/v1/projects/${checked(ref)}`)) as Record<string, unknown>;
      return {
        ref,
        organizationId: String(body.organization_id ?? ''),
        name: String(body.name ?? ''),
        region: String(body.region ?? ''),
      };
    },
    async runSql(ref, sql) {
      const body = await call(`/v1/projects/${checked(ref)}/database/query`, {
        method: 'POST',
        body: JSON.stringify({ query: sql }),
      });
      return Array.isArray(body) ? (body as Record<string, unknown>[]) : [];
    },
  };
}

/* ── Guards ────────────────────────────────────────────────────────── */

/** Fan-out and provisioning are run by a person, from their own machine. */
export function assertRunsLocally(env: Readonly<Record<string, string | undefined>>): void {
  if (env.CI || env.GITHUB_ACTIONS || env.VERCEL) {
    throw new Error(
      'This tool does not run in CI: the repository is public, and its logs would show which projects are tenants. Run it from a local session.',
    );
  }
}

export interface Target {
  /** A label for the report. Never committed anywhere. */
  readonly name: string;
  readonly ref: string;
}

export interface OrganisationRule {
  /** The one organisation whose projects this run may touch. */
  readonly engineOrganizationId: string;
  /** Organisations that must never be touched, whatever else is configured. */
  readonly forbiddenOrganizationIds?: readonly string[];
}

export const STATE_SQL = `select
  (to_regclass('engine.schema_migrations') is not null) as has_ledger,
  (select count(*)::int from pg_catalog.pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r') as public_tables,
  (select coalesce(array_agg(n.nspname::text), array[]::text[]) from pg_catalog.pg_namespace n
    where n.nspname in ('vision', 'wear')) as sibling_schemas`;

export interface TargetState {
  readonly target: Target;
  readonly project: ProjectInfo;
  /** Versions already applied, in order. */
  readonly applied: readonly string[];
  readonly pending: readonly EngineMigration[];
}

/**
 * Looks at a target without changing it, and refuses anything that is not an engine project:
 * another organisation, a database with a sibling app's schema, or a database that already has
 * tables but no engine ledger (someone else's database).
 */
export async function inspectTarget(
  client: ManagementClient,
  target: Target,
  rule: OrganisationRule,
  migrations: readonly EngineMigration[],
): Promise<TargetState> {
  if (rule.engineOrganizationId.trim() === '')
    throw new Error('Say which organisation holds the engine projects.');
  const project = await client.getProject(target.ref);
  if ((rule.forbiddenOrganizationIds ?? []).includes(project.organizationId)) {
    throw new Error(
      `"${target.name}" is in an organisation this tool must never touch. Nothing was changed.`,
    );
  }
  if (project.organizationId !== rule.engineOrganizationId) {
    throw new Error(`"${target.name}" is not in the engine organisation. Nothing was changed.`);
  }

  const [state] = await client.runSql(target.ref, STATE_SQL);
  const siblings = (state?.sibling_schemas as string[] | undefined) ?? [];
  if (siblings.length > 0) {
    throw new Error(
      `"${target.name}" holds the schema ${siblings.join(', ')}: it is not an engine project. Nothing was changed.`,
    );
  }
  const hasLedger = state?.has_ledger === true;
  if (!hasLedger && Number(state?.public_tables ?? 0) > 0) {
    throw new Error(
      `"${target.name}" already has tables but no engine ledger: it is not an empty project and not an engine project. Nothing was changed.`,
    );
  }

  const applied = hasLedger
    ? (
        await client.runSql(
          target.ref,
          'select version from engine.schema_migrations order by version',
        )
      ).map((row) => String(row.version))
    : [];
  const known = migrations.map((migration) => migration.version);
  applied.forEach((version, index) => {
    if (known[index] !== version) {
      throw new Error(
        `"${target.name}" has the migration ${version} where this repository has ${known[index] ?? 'nothing'}: its history is not a prefix of the engine line. Nothing was changed.`,
      );
    }
  });
  return { target, project, applied, pending: migrations.slice(applied.length) };
}

/* ── Apply and report ──────────────────────────────────────────────── */

export interface TargetReport {
  readonly name: string;
  readonly region: string;
  readonly headBefore: string | null;
  readonly headAfter: string | null;
  readonly applied: readonly string[];
  readonly pending: readonly string[];
  /** The whole-schema fingerprint after the run, or null when it was not read. */
  readonly fingerprint: string | null;
  readonly checks: 'passed' | 'not-run';
}

export interface FanoutReport {
  readonly targets: readonly TargetReport[];
  /** True when every target on the newest migration has the same fingerprint. */
  readonly inStep: boolean;
  /** The target the run stopped at, with the reason; null when it finished. */
  readonly stoppedAt: { readonly name: string; readonly reason: string } | null;
}

export interface FanoutOptions {
  readonly client: ManagementClient;
  readonly targets: readonly Target[];
  readonly migrations: readonly EngineMigration[];
  readonly rule: OrganisationRule;
  /** False only plans: nothing is written. */
  readonly apply: boolean;
  /** SQL files that raise when something is wrong (the catalogue and security checks). */
  readonly checks: readonly { readonly name: string; readonly sql: string }[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly log?: (line: string) => void;
}

const last = <T>(values: readonly T[]): T | null => values[values.length - 1] ?? null;

async function readFingerprint(client: ManagementClient, ref: string): Promise<string | null> {
  const rows = await client.runSql(
    ref,
    "select hash from engine.schema_fingerprint() where part = 'all'",
  );
  const hash = rows[0]?.hash;
  return typeof hash === 'string' ? hash : null;
}

export async function fanOut(options: FanoutOptions): Promise<FanoutReport> {
  assertRunsLocally(options.env);
  const log = options.log ?? (() => undefined);
  const reports: TargetReport[] = [];
  let stoppedAt: FanoutReport['stoppedAt'] = null;

  // Look at every target before changing any: a wrong entry in the list stops the run early.
  const states: TargetState[] = [];
  for (const target of options.targets) {
    states.push(await inspectTarget(options.client, target, options.rule, options.migrations));
  }

  for (const state of states) {
    const { target, project } = state;
    const applied: string[] = [];
    let fingerprint: string | null = null;
    let checks: TargetReport['checks'] = 'not-run';
    try {
      if (options.apply) {
        for (const migration of state.pending) {
          log(`${target.name}: applying ${migration.file}`);
          // One transaction per migration: a failure leaves the database at the previous one.
          await options.client.runSql(target.ref, `begin;\n${migration.sql}\ncommit;`);
          const recorded = await options.client.runSql(
            target.ref,
            `select 1 as ok from engine.schema_migrations where version = '${migration.version}'`,
          );
          if (recorded.length !== 1)
            throw new Error(`${migration.file} did not record itself in the ledger.`);
          applied.push(migration.version);
        }
        for (const check of options.checks) {
          log(`${target.name}: running the ${check.name} check`);
          await options.client.runSql(target.ref, check.sql);
        }
        checks = options.checks.length > 0 ? 'passed' : 'not-run';
      }
      if (state.applied.length + applied.length > 0)
        fingerprint = await readFingerprint(options.client, target.ref);
    } catch (error) {
      stoppedAt = { name: target.name, reason: (error as Error).message };
    }
    const pendingAfter = state.pending.slice(applied.length).map((migration) => migration.version);
    reports.push({
      name: target.name,
      region: project.region,
      headBefore: last(state.applied),
      headAfter: last([...state.applied, ...applied]),
      applied,
      pending: pendingAfter,
      fingerprint,
      checks,
    });
    if (stoppedAt) break;
  }

  const newest = last(options.migrations)?.version ?? null;
  const atHead = reports.filter(
    (report) => report.headAfter === newest && report.fingerprint !== null,
  );
  const inStep =
    stoppedAt === null && new Set(atHead.map((report) => report.fingerprint)).size <= 1;
  return { targets: reports, inStep, stoppedAt };
}

export function describeReport(report: FanoutReport): string {
  const lines = report.targets.map(
    (target) =>
      `${target.name} (${target.region}): ${target.headBefore ?? 'empty'} -> ${target.headAfter ?? 'empty'}` +
      `, applied ${target.applied.length}, still pending ${target.pending.length}` +
      `, checks ${target.checks}, fingerprint ${target.fingerprint ?? 'not read'}`,
  );
  if (report.stoppedAt)
    lines.push(`STOPPED at ${report.stoppedAt.name}: ${report.stoppedAt.reason}`);
  lines.push(
    report.inStep
      ? 'Every project on the newest migration has the same schema.'
      : 'DRIFT: projects on the newest migration differ, or the run stopped. Look before doing anything else.',
  );
  return lines.join('\n');
}

/** Reads the target list a person passes in: a JSON array of {name, ref}. */
export function parseTargets(json: string): Target[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('The tenant list must be a list.');
  return parsed.map((entry, index) => {
    const { name, ref } = (entry ?? {}) as Record<string, unknown>;
    if (
      typeof name !== 'string' ||
      name.trim() === '' ||
      typeof ref !== 'string' ||
      !PROJECT_REF_RE.test(ref)
    ) {
      throw new Error(
        `Entry ${index + 1} of the tenant list needs a name and a project reference.`,
      );
    }
    return { name, ref };
  });
}
