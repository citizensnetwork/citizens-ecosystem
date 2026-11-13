/**
 * Cuts the generated part of the engine baseline from a private structure dump.
 *
 *   pnpm --filter @engine/db cut -- <path to the dump .json>
 *
 * The dump is never committed (it is the catalogue of the source database). This command
 * writes the generated migration files and `baseline.lock.json`, which records what the dump
 * was (its hash, its pinned head) and what the baseline must contain.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAllowlist } from '../allowlist.ts';
import { cutBaseline, type Dump } from '../cut.ts';
import { BASELINE_LOCK_PATH, MIGRATIONS_DIR } from '../paths.ts';

const dumpPath = process.argv.slice(2).find((arg) => !arg.startsWith('-'));
if (dumpPath === undefined) {
  console.error('Give the path of the structure dump (a .json file kept outside the repository).');
  process.exit(2);
}

const raw = readFileSync(resolve(dumpPath));
const dump = JSON.parse(raw.toString('utf8')) as Dump;
const allowlist = loadAllowlist();
const result = cutBaseline(dump, allowlist);

mkdirSync(MIGRATIONS_DIR, { recursive: true });
for (const [name, sql] of Object.entries(result.files)) {
  writeFileSync(resolve(MIGRATIONS_DIR, name), sql, 'utf8');
  console.log(`wrote ${name} (${sql.length} characters)`);
}

const lock = {
  $comment:
    'Written by `pnpm --filter @engine/db cut`. It records which dump the generated baseline files were cut from, and what a database built from the baseline must contain. The dump itself is private.',
  source: {
    pinnedHead: allowlist.pinned.citizensHead,
    pinnedBy: allowlist.pinned.by,
    dumpedAt: dump.pinned_at,
    serverVersion: dump.server_version,
    dumpSha256: createHash('sha256').update(raw).digest('hex'),
    counted: {
      tables: dump.tables.length,
      functions: dump.functions.length,
      policies: dump.policies.length,
      triggers: dump.triggers.length,
    },
  },
  expected: result.expected,
};
writeFileSync(BASELINE_LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
console.log(
  `baseline.lock.json: ${result.expected.tables.length} tables, ${result.expected.functions.length} functions as they are, ` +
    `${result.expected.changedFunctions.length} changed, ${result.expected.triggers.length} triggers, ` +
    `${Object.values(result.expected.policies).reduce((a, b) => a + b, 0)} policies, ${result.expected.indexes} indexes, ` +
    `${result.expected.constraints} constraints`,
);
