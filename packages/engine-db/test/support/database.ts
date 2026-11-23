/**
 * Builds a database line from empty in an in-memory Postgres (PGlite), the way a new project
 * gets it: the test-only platform shim first, then every migration file of the line in order.
 * The same helpers serve both lines; `line` defaults to the engine line.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { listMigrations } from '../../src/migrations.ts';
import { linePaths, PLATFORM_SHIM_PATH, type LineName } from '../../src/paths.ts';

export type Database = PGlite;

const read = (path: string) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');

export async function emptyDatabase(): Promise<Database> {
  const db = await PGlite.create({ extensions: { pg_trgm, pgcrypto, uuid_ossp } });
  await db.exec(read(PLATFORM_SHIM_PATH));
  return db;
}

export async function buildDatabase(line: LineName): Promise<Database> {
  const db = await emptyDatabase();
  for (const migration of listMigrations(linePaths(line).migrations)) {
    try {
      await db.exec(migration.sql);
    } catch (error) {
      throw new Error(`${migration.file} failed: ${(error as Error).message}`, { cause: error });
    }
  }
  return db;
}

export const buildEngineDatabase = () => buildDatabase('engine');
export const buildControlDatabase = () => buildDatabase('control');

export function probeFiles(line: LineName = 'engine'): string[] {
  return readdirSync(linePaths(line).probes)
    .filter((file) => file.endsWith('.sql') && !file.startsWith('_'))
    .sort();
}

/** Runs one probe inside a transaction that is always rolled back. Returns the error, or null. */
export async function runProbe(
  db: Database,
  file: string,
  line: LineName = 'engine',
): Promise<string | null> {
  return runProbeSql(db, read(resolve(linePaths(line).probes, file)), line);
}

/** The same, for probe text given directly. */
export async function runProbeSql(
  db: Database,
  probe: string,
  line: LineName = 'engine',
): Promise<string | null> {
  const setup = read(resolve(linePaths(line).probes, '_setup.sql'));
  try {
    await db.exec(`begin;\n${setup}\n${probe}\nrollback;`);
    return null;
  } catch (error) {
    await db.exec('rollback; reset role;');
    return (error as Error).message;
  }
}

/** Runs one check file. Returns the error, or null when the check found nothing. */
export async function runCheck(
  db: Database,
  file: string,
  line: LineName = 'engine',
): Promise<string | null> {
  try {
    await db.exec(read(resolve(linePaths(line).checks, file)));
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/** Applies a change, runs a check, and undoes the change. Returns what the check said. */
export async function checkWhenBroken(
  db: Database,
  statement: string,
  file: string,
  line: LineName = 'engine',
): Promise<string> {
  await db.exec(`begin; ${statement}`);
  const result = await runCheck(db, file, line);
  await db.exec('rollback;');
  return result ?? '';
}

export async function rows<T>(db: Database, sql: string): Promise<T[]> {
  return (await db.query<T>(sql)).rows;
}
