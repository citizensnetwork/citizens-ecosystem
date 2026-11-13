/**
 * The drift check between the Citizens database line and the engine line, from the command line.
 *
 *   pnpm --filter @engine/db drift
 *
 * The same check runs in the unit tests, so CI fails when a Citizens migration has no entry in
 * `supabase-engine/citizens-line-ledger.json`.
 */

import { loadAllowlist } from '../allowlist.ts';
import { checkDriftOnDisk } from '../drift.ts';
import { listMigrations } from '../migrations.ts';

const report = checkDriftOnDisk({
  allowlist: loadAllowlist(),
  engineMigrations: listMigrations().map((migration) => migration.file),
});
for (const warning of report.warnings) console.warn(`waiting: ${warning.file} ${warning.problem}`);
for (const problem of report.problems) console.error(`${problem.file} ${problem.problem}`);
if (report.problems.length === 0) console.log('The two lines agree with the ledger.');
process.exit(report.problems.length > 0 ? 1 : 0);
