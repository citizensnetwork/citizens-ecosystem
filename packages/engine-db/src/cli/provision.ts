/**
 * Prints the provisioning plan for one tenant project. It changes nothing and calls nothing.
 *
 *   pnpm --filter @engine/db provision -- --project-url https://<project>.supabase.co \
 *     --publishable-key <key> --site-url https://world.example --entitlements <file.json>
 *
 * The entitlements file is the tenant's own and is kept outside this repository.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAllowlist } from '../allowlist.ts';
import { assertRunsLocally } from '../fanout.ts';
import { describePlan, provisioningPlan } from '../provision.ts';

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined) {
    console.error(`Missing --${name}.`);
    process.exit(2);
  }
  return value;
}

assertRunsLocally(process.env);
const plan = provisioningPlan(
  {
    projectUrl: argument('project-url'),
    publishableKey: argument('publishable-key'),
    siteUrl: argument('site-url'),
    entitlements: JSON.parse(readFileSync(resolve(argument('entitlements')), 'utf8')),
  },
  loadAllowlist(),
);
console.log(describePlan(plan));
