/**
 * Writes `supabase-engine/migrations.lock.json`: the SHA-256 of every engine migration file.
 *
 *   pnpm --filter @engine/db lock            write the lock
 *   pnpm --filter @engine/db lock -- --check  only compare (exit 1 when they differ)
 *
 * Write it when you ADD a migration. If it changes for a file that is already applied to a
 * tenant, stop: an applied migration never changes; write a new one instead.
 */

import { writeFileSync } from 'node:fs';
import { buildLock, compareWithLock, listMigrations, readLock } from '../migrations.ts';
import { MIGRATIONS_LOCK_PATH } from '../paths.ts';

const migrations = listMigrations();
if (process.argv.includes('--check')) {
  const problems = compareWithLock(migrations, readLock());
  for (const problem of problems) console.error(`${problem.file}: ${problem.problem}`);
  process.exit(problems.length > 0 ? 1 : 0);
}
const lock = {
  $comment:
    'The SHA-256 of every engine migration file (line endings normalised). Written by `pnpm --filter @engine/db lock`. A test fails when a file differs from its entry: an applied migration never changes.',
  ...buildLock(migrations),
};
writeFileSync(MIGRATIONS_LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
console.log(`locked ${migrations.length} migrations`);
