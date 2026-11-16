/** Where the engine's database lines live in the repository. */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(here, '..', '..', '..');
export const ENGINE_DIR = resolve(REPO_ROOT, 'supabase-engine');
export const CONTROL_DIR = resolve(REPO_ROOT, 'supabase-control');
export const MIGRATIONS_DIR = resolve(ENGINE_DIR, 'migrations');
export const PROBES_DIR = resolve(ENGINE_DIR, 'probes');
export const CHECKS_DIR = resolve(ENGINE_DIR, 'checks');
export const ALLOWLIST_PATH = resolve(ENGINE_DIR, 'allowlist.json');
export const BASELINE_LOCK_PATH = resolve(ENGINE_DIR, 'baseline.lock.json');
export const MIGRATIONS_LOCK_PATH = resolve(ENGINE_DIR, 'migrations.lock.json');
export const DRIFT_LEDGER_PATH = resolve(ENGINE_DIR, 'citizens-line-ledger.json');
export const PLATFORM_SHIM_PATH = resolve(ENGINE_DIR, 'test', 'platform-shim.sql');
export const CITIZENS_MIGRATIONS_DIR = resolve(REPO_ROOT, 'supabase', 'migrations');

/**
 * A database line: one directory of numbered migrations with its own lock, probes and checks.
 * - `engine` builds a tenant's own project (`supabase-engine/`).
 * - `control` builds the engine owner's control plane (`supabase-control/`).
 * The two never mix: a file of one line is never applied to a database of the other.
 */
export type LineName = 'engine' | 'control';

export const LINE_NAMES: readonly LineName[] = ['engine', 'control'];

export interface LinePaths {
  readonly name: LineName;
  readonly dir: string;
  readonly migrations: string;
  readonly probes: string;
  readonly checks: string;
  readonly lock: string;
  /** The table in which every migration of the line records itself. */
  readonly ledgerTable: string;
  /** The package command that writes the lock, for messages. */
  readonly lockCommand: string;
}

export function linePaths(name: LineName): LinePaths {
  const dir = name === 'engine' ? ENGINE_DIR : CONTROL_DIR;
  return {
    name,
    dir,
    migrations: resolve(dir, 'migrations'),
    probes: resolve(dir, 'probes'),
    checks: resolve(dir, 'checks'),
    lock: resolve(dir, 'migrations.lock.json'),
    ledgerTable: `${name}.schema_migrations`,
    lockCommand:
      name === 'engine'
        ? 'pnpm --filter @engine/db lock'
        : 'pnpm --filter @engine/db lock -- --line control',
  };
}

export function isLineName(value: string): value is LineName {
  return (LINE_NAMES as readonly string[]).includes(value);
}
