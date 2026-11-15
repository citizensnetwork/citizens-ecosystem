/**
 * The drift check between the two database lines.
 *
 * The Citizens project keeps its own migration history in `supabase/migrations`. The engine line
 * was cut from it at a pinned head. From then on, every new Citizens migration is a question:
 * does a tenant need the same change? The answer is written down in
 * `supabase-engine/citizens-line-ledger.json`, one entry per Citizens migration after the head:
 *
 *   "citizens-only"  the change stays out of the engine line (say why)
 *   "twinned"        the same change is in the engine line (name the engine migration)
 *   "not-yet"        the engine line needs it and does not have it yet (say what is waiting);
 *                    allowed, but printed as a warning until it becomes one of the other two
 *
 * The check fails when a Citizens migration is not in the ledger, when an entry names a file that
 * is gone, when "twinned" names an engine migration that does not exist, or when a migration that
 * touches something the engine line also has is waved through as "citizens-only" with no reason.
 *
 * Why a ledger and not a comparison of two databases built from empty: the Citizens line cannot
 * be built from its files alone (two of its first tables predate the migration files).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Allowlist } from './allowlist.ts';
import { CITIZENS_MIGRATIONS_DIR, DRIFT_LEDGER_PATH } from './paths.ts';
import { scanSql } from './sql-scan.ts';

export type DriftVerdict = 'citizens-only' | 'twinned' | 'not-yet';

export interface DriftEntry {
  readonly verdict: DriftVerdict;
  /** Why, in a sentence. Needed for "citizens-only" and "not-yet". */
  readonly reason?: string;
  /** The engine migration file that carries the same change. Needed for "twinned". */
  readonly engineMigration?: string;
}

export interface DriftLedger {
  /** The Citizens migration files the baseline was cut at. Nothing in this list needs an entry. */
  readonly baselineFiles: readonly string[];
  /** One entry per Citizens migration file added after the baseline. */
  readonly after: Readonly<Record<string, DriftEntry>>;
}

export interface DriftProblem {
  readonly file: string;
  readonly problem: string;
}

export interface DriftReport {
  readonly problems: readonly DriftProblem[];
  readonly warnings: readonly DriftProblem[];
}

export function loadLedger(path: string = DRIFT_LEDGER_PATH): DriftLedger {
  return JSON.parse(readFileSync(path, 'utf8')) as DriftLedger;
}

export function listCitizensMigrations(dir: string = CITIZENS_MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

/** The engine-covered tables and functions a Citizens migration mentions in its code. */
export function engineObjectsTouched(sql: string, allowlist: Allowlist): string[] {
  const covered = new Set<string>([
    ...allowlist.tables.engine,
    ...allowlist.functions.engine,
    ...Object.keys(allowlist.functions.changed),
    ...allowlist.views.engine,
  ]);
  const touched = new Set<string>();
  for (const segment of scanSql(sql)) {
    if (segment.kind !== 'code' && segment.kind !== 'identifier') continue;
    for (const word of segment.text.match(/[a-z_][a-z0-9_]*/g) ?? []) {
      if (covered.has(word)) touched.add(word);
    }
  }
  return [...touched].sort();
}

export interface DriftInput {
  readonly ledger: DriftLedger;
  readonly allowlist: Allowlist;
  /** Citizens migration file name -> its SQL. */
  readonly citizensMigrations: Readonly<Record<string, string>>;
  /** The engine migration file names. */
  readonly engineMigrations: readonly string[];
}

export function checkDrift(input: DriftInput): DriftReport {
  const { ledger, allowlist, citizensMigrations, engineMigrations } = input;
  const problems: DriftProblem[] = [];
  const warnings: DriftProblem[] = [];
  const baseline = new Set(ledger.baselineFiles);
  const present = new Set(Object.keys(citizensMigrations));

  for (const file of baseline) {
    if (!present.has(file)) {
      problems.push({
        file,
        problem: 'is in the baseline list but is no longer a Citizens migration file.',
      });
    }
  }
  for (const file of Object.keys(ledger.after)) {
    if (!present.has(file))
      problems.push({ file, problem: 'has a ledger entry but is not a Citizens migration file.' });
    if (baseline.has(file))
      problems.push({ file, problem: 'is listed both in the baseline and after it.' });
  }

  for (const [file, sql] of Object.entries(citizensMigrations)) {
    if (baseline.has(file)) continue;
    const entry = Object.hasOwn(ledger.after, file) ? ledger.after[file] : undefined;
    const touched = engineObjectsTouched(sql, allowlist);
    const touches =
      touched.length === 0
        ? 'It names nothing the engine line has.'
        : `It names ${touched.slice(0, 8).join(', ')}${touched.length > 8 ? ', ...' : ''}, which the engine line also has.`;
    if (entry === undefined) {
      problems.push({
        file,
        problem: `is a new Citizens migration with no entry in supabase-engine/citizens-line-ledger.json. ${touches} Decide: "citizens-only" (with a reason), "twinned" (with the engine migration), or "not-yet".`,
      });
      continue;
    }
    const reason = entry.reason?.trim() ?? '';
    if (entry.verdict === 'twinned') {
      if (!entry.engineMigration || !engineMigrations.includes(entry.engineMigration)) {
        problems.push({
          file,
          problem: `is marked "twinned" but names no existing engine migration.`,
        });
      }
    } else if (entry.verdict === 'citizens-only') {
      if (reason.length < 10) {
        problems.push({ file, problem: `is marked "citizens-only" without a reason. ${touches}` });
      }
    } else if (entry.verdict === 'not-yet') {
      if (reason.length < 10)
        problems.push({ file, problem: 'is marked "not-yet" without saying what is waiting.' });
      else warnings.push({ file, problem: `the engine line still needs this change: ${reason}` });
    } else {
      problems.push({ file, problem: `has the unknown verdict "${String(entry.verdict)}".` });
    }
  }
  return { problems, warnings };
}

/** Reads both lines from disk and checks them. */
export function checkDriftOnDisk(options: {
  readonly allowlist: Allowlist;
  readonly engineMigrations: readonly string[];
  readonly ledgerPath?: string;
  readonly citizensDir?: string;
}): DriftReport {
  const dir = options.citizensDir ?? CITIZENS_MIGRATIONS_DIR;
  const citizensMigrations: Record<string, string> = {};
  for (const file of listCitizensMigrations(dir)) {
    citizensMigrations[file] = readFileSync(resolve(dir, file), 'utf8');
  }
  return checkDrift({
    ledger: loadLedger(options.ledgerPath),
    allowlist: options.allowlist,
    citizensMigrations,
    engineMigrations: options.engineMigrations,
  });
}
