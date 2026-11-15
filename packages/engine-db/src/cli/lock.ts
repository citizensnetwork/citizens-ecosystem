/**
 * Writes a line's `migrations.lock.json`: the SHA-256 of every migration file of that line.
 *
 *   pnpm --filter @engine/db lock                        the engine line (supabase-engine/)
 *   pnpm --filter @engine/db lock -- --line control      the control plane (supabase-control/)
 *   pnpm --filter @engine/db lock -- --check             only compare (exit 1 when they differ)
 *
 * Write it when you ADD a migration. If it changes for a file that is already applied to a
 * database, stop: an applied migration never changes; write a new one instead.
 */

import { writeFileSync } from 'node:fs';
import { buildLock, compareWithLock, listMigrations, readLock } from '../migrations.ts';
import { isLineName, linePaths } from '../paths.ts';

const lineArgument = process.argv.indexOf('--line');
const lineName = lineArgument === -1 ? 'engine' : (process.argv[lineArgument + 1] ?? '');
if (!isLineName(lineName)) {
  console.error(`--line must be "engine" or "control", not "${lineName}".`);
  process.exit(2);
}
const line = linePaths(lineName);

const migrations = listMigrations(line.migrations);
if (process.argv.includes('--check')) {
  const problems = compareWithLock(migrations, readLock(line.lock));
  for (const problem of problems) console.error(`${problem.file}: ${problem.problem}`);
  process.exit(problems.length > 0 ? 1 : 0);
}
const lock = {
  $comment: `The SHA-256 of every ${line.name} migration file (line endings normalised). Written by \`${line.lockCommand}\`. A test fails when a file differs from its entry: an applied migration never changes.`,
  ...buildLock(migrations),
};
writeFileSync(line.lock, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
console.log(`locked ${migrations.length} ${line.name} migrations`);
