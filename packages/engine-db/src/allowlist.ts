/**
 * The allow-list: which objects of the source database go into the engine baseline.
 * The file is `supabase-engine/allowlist.json`. Out is the default: an object that is not listed
 * under "engine" (or "changed") never reaches a tenant.
 */

import { readFileSync } from 'node:fs';
import { ALLOWLIST_PATH } from './paths.ts';

export interface Allowlist {
  readonly pinned: { readonly citizensHead: string; readonly by: string };
  readonly tables: {
    readonly engine: readonly string[];
    readonly changed: Readonly<Record<string, string>>;
    readonly citizensOnly: Readonly<Record<string, string>>;
    /** Tables the data API roles may read but never write, whatever the source granted. */
    readonly readOnlyForDataApi: Readonly<Record<string, string>>;
  };
  readonly columns: {
    readonly citizensOnly: Readonly<Record<string, Readonly<Record<string, string>>>>;
  };
  readonly constraints: {
    readonly replaced: Readonly<Record<string, string>>;
    readonly dropped: Readonly<Record<string, string>>;
  };
  readonly defaults: { readonly dropped: Readonly<Record<string, string>> };
  readonly views: {
    readonly engine: readonly string[];
    readonly citizensOnly: Readonly<Record<string, string>>;
  };
  readonly functions: {
    readonly engine: readonly string[];
    readonly changed: Readonly<Record<string, string>>;
    readonly citizensOnly: Readonly<Record<string, readonly string[]>>;
  };
  readonly triggers: {
    readonly engine: readonly string[];
    readonly citizensOnly: readonly string[];
  };
  readonly scheduledJobs: {
    readonly engine: readonly string[];
    readonly changed: Readonly<Record<string, string>>;
    readonly citizensOnly: readonly string[];
  };
  readonly storageBuckets: {
    readonly engine: readonly string[];
    readonly citizensOnly: readonly string[];
  };
  readonly realtime: { readonly engine: readonly string[] };
  readonly schemas: { readonly citizensOnly: readonly string[] };
  readonly edgeFunctions: { readonly changed: readonly string[] };
}

export function loadAllowlist(path: string = ALLOWLIST_PATH): Allowlist {
  return JSON.parse(readFileSync(path, 'utf8')) as Allowlist;
}

/** Every function name that stays out, whatever its reason. */
export function citizensOnlyFunctions(allowlist: Allowlist): string[] {
  return Object.values(allowlist.functions.citizensOnly).flat();
}

/**
 * Names that must never appear in the engine line, in any file or in a built database.
 * A cut column is only listed when its name is unmistakable: a plain word such as "timezone"
 * is checked in the built database's catalogue instead (see `ambiguousColumns`).
 */
export function deniedNames(allowlist: Allowlist): string[] {
  const names = new Set<string>([
    ...Object.keys(allowlist.tables.citizensOnly),
    ...Object.keys(allowlist.views.citizensOnly),
    ...citizensOnlyFunctions(allowlist),
    ...allowlist.triggers.citizensOnly.map((trigger) => trigger.split('.').pop() as string),
    ...allowlist.scheduledJobs.citizensOnly,
    ...allowlist.storageBuckets.citizensOnly,
  ]);
  for (const columns of Object.values(allowlist.columns.citizensOnly)) {
    for (const column of Object.keys(columns)) {
      if (!AMBIGUOUS_COLUMNS.has(column)) names.add(column);
    }
  }
  return [...names].sort();
}

/** Cut column names that are also ordinary words; only the catalogue check can judge them. */
export const AMBIGUOUS_COLUMNS: ReadonlySet<string> = new Set(['timezone']);

/** Every cut column as "table.column", for the catalogue check of a built database. */
export function deniedColumns(allowlist: Allowlist): string[] {
  const out: string[] = [];
  for (const [table, columns] of Object.entries(allowlist.columns.citizensOnly)) {
    for (const column of Object.keys(columns)) out.push(`${table}.${column}`);
  }
  return out.sort();
}
