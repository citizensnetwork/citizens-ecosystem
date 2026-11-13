/** Where the engine database line lives in the repository. */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(here, '..', '..', '..');
export const ENGINE_DIR = resolve(REPO_ROOT, 'supabase-engine');
export const MIGRATIONS_DIR = resolve(ENGINE_DIR, 'migrations');
export const PROBES_DIR = resolve(ENGINE_DIR, 'probes');
export const CHECKS_DIR = resolve(ENGINE_DIR, 'checks');
export const ALLOWLIST_PATH = resolve(ENGINE_DIR, 'allowlist.json');
export const BASELINE_LOCK_PATH = resolve(ENGINE_DIR, 'baseline.lock.json');
export const MIGRATIONS_LOCK_PATH = resolve(ENGINE_DIR, 'migrations.lock.json');
export const DRIFT_LEDGER_PATH = resolve(ENGINE_DIR, 'citizens-line-ledger.json');
export const PLATFORM_SHIM_PATH = resolve(ENGINE_DIR, 'test', 'platform-shim.sql');
export const CITIZENS_MIGRATIONS_DIR = resolve(REPO_ROOT, 'supabase', 'migrations');
