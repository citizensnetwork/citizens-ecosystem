/**
 * The engine migration files, in order, and the lock that pins them.
 *
 * An applied migration never changes. `migrations.lock.json` holds the SHA-256 of every file; a
 * test fails when a file differs from its entry, so an edit to a migration that may already be
 * in a tenant's database cannot pass review unseen. A new migration adds a new entry.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MIGRATIONS_DIR, MIGRATIONS_LOCK_PATH } from './paths.ts';

export interface EngineMigration {
  /** Four digits: "0004". */
  readonly version: string;
  /** The rest of the file name, without ".sql": "engine_configuration". */
  readonly name: string;
  readonly file: string;
  readonly path: string;
  readonly sql: string;
  readonly sha256: string;
}

export const MIGRATION_FILE_RE = /^(\d{4})_([a-z][a-z0-9_]*)\.sql$/;

/** Line endings are normalised before hashing, so a checkout setting cannot change a hash. */
export function sha256(text: string): string {
  return createHash('sha256').update(text.replaceAll('\r\n', '\n'), 'utf8').digest('hex');
}

export function listMigrations(dir: string = MIGRATIONS_DIR): EngineMigration[] {
  const migrations: EngineMigration[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.sql')) continue;
    const match = MIGRATION_FILE_RE.exec(file);
    if (!match) throw new Error(`"${file}" is not named like 0001_some_name.sql.`);
    const path = resolve(dir, file);
    const sql = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
    migrations.push({
      version: match[1] as string,
      name: match[2] as string,
      file,
      path,
      sql,
      sha256: sha256(sql),
    });
  }
  migrations.forEach((migration, index) => {
    const expected = String(index + 1).padStart(4, '0');
    if (migration.version !== expected) {
      throw new Error(
        `Migration numbers must run 0001, 0002, ... with no gap: found ${migration.file} where ${expected} belongs.`,
      );
    }
  });
  return migrations;
}

export interface MigrationsLock {
  readonly files: Readonly<Record<string, string>>;
}

export function buildLock(migrations: readonly EngineMigration[]): MigrationsLock {
  return {
    files: Object.fromEntries(migrations.map((migration) => [migration.file, migration.sha256])),
  };
}

export function readLock(path: string = MIGRATIONS_LOCK_PATH): MigrationsLock {
  return JSON.parse(readFileSync(path, 'utf8')) as MigrationsLock;
}

export interface LockProblem {
  readonly file: string;
  readonly problem: 'changed' | 'not-locked' | 'missing';
}

/** What differs between the files on disk and the lock. An empty list means they agree. */
export function compareWithLock(
  migrations: readonly EngineMigration[],
  lock: MigrationsLock,
): LockProblem[] {
  const problems: LockProblem[] = [];
  const onDisk = new Map(migrations.map((migration) => [migration.file, migration.sha256]));
  for (const [file, hash] of onDisk) {
    const locked = Object.hasOwn(lock.files, file) ? lock.files[file] : undefined;
    if (locked === undefined) problems.push({ file, problem: 'not-locked' });
    else if (locked !== hash) problems.push({ file, problem: 'changed' });
  }
  for (const file of Object.keys(lock.files)) {
    if (!onDisk.has(file)) problems.push({ file, problem: 'missing' });
  }
  return problems;
}

/** Does the file end by writing its own row into the ledger, with its own number and name? */
export function recordsItself(migration: EngineMigration): boolean {
  const pattern = new RegExp(
    `insert into engine\\.schema_migrations \\(version, name\\) values \\('${migration.version}', '${migration.name}'\\);\\s*$`,
  );
  return pattern.test(migration.sql);
}
