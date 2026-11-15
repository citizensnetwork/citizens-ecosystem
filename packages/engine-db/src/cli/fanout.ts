/**
 * Fan-out from the command line. Run by a person, locally; it refuses to run in CI.
 *
 *   pnpm --filter @engine/db fanout -- --targets <tenants.json>            plan only
 *   pnpm --filter @engine/db fanout -- --targets <tenants.json> --apply    apply, check, report
 *
 * Environment:
 *   SUPABASE_ACCESS_TOKEN      a token limited to the engine organisation
 *   ENGINE_ORG_ID              the engine organisation: the only one this run may touch
 *   ENGINE_FORBIDDEN_ORG_IDS   optional, comma separated: organisations never to touch
 *
 * The tenant list is a JSON file of [{ "name": "...", "ref": "..." }] kept OUTSIDE this
 * repository (it names tenants). A path inside the repository is refused.
 */

import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { createManagementClient, describeReport, fanOut, parseTargets } from '../fanout.ts';
import { listMigrations } from '../migrations.ts';
import { CHECKS_DIR, REPO_ROOT } from '../paths.ts';

const fail = (message: string): never => {
  console.error(message);
  process.exit(2);
};

const targetsIndex = process.argv.indexOf('--targets');
const targetsArgument = targetsIndex === -1 ? undefined : process.argv[targetsIndex + 1];
if (targetsArgument === undefined)
  fail('Give the tenant list: --targets <file kept outside the repository>.');
const targetsPath = resolve(targetsArgument as string);
const fromRoot = relative(REPO_ROOT, targetsPath);
if (!fromRoot.startsWith('..') && !/^[A-Za-z]:/.test(fromRoot)) {
  fail('The tenant list must not be a file inside this repository: it names tenants.');
}

const token = process.env.SUPABASE_ACCESS_TOKEN ?? fail('Set SUPABASE_ACCESS_TOKEN.');
const engineOrganizationId =
  process.env.ENGINE_ORG_ID ?? fail('Set ENGINE_ORG_ID to the engine organisation.');

const report = await fanOut({
  client: createManagementClient(token),
  targets: parseTargets(readFileSync(targetsPath, 'utf8')),
  migrations: listMigrations(),
  rule: {
    engineOrganizationId,
    forbiddenOrganizationIds: (process.env.ENGINE_FORBIDDEN_ORG_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== ''),
  },
  apply: process.argv.includes('--apply'),
  checks: ['catalogue.sql', 'security.sql'].map((name) => ({
    name,
    sql: readFileSync(resolve(CHECKS_DIR, name), 'utf8'),
  })),
  env: process.env,
  log: (line) => console.log(line),
});
console.log(describeReport(report));
process.exit(report.stoppedAt === null && report.inStep ? 0 : 1);
