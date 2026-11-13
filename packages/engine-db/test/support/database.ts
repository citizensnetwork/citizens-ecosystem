/**
 * Builds the engine line from empty in an in-memory Postgres (PGlite), the way a new project gets
 * it: the test-only platform shim first, then every migration file in order.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { listMigrations } from '../../src/migrations.ts';
import { CHECKS_DIR, PLATFORM_SHIM_PATH, PROBES_DIR } from '../../src/paths.ts';

export type Database = PGlite;

const read = (path: string) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');

export async function emptyDatabase(): Promise<Database> {
  const db = await PGlite.create({ extensions: { pg_trgm, pgcrypto, uuid_ossp } });
  await db.exec(read(PLATFORM_SHIM_PATH));
  return db;
}

export async function buildEngineDatabase(): Promise<Database> {
  const db = await emptyDatabase();
  for (const migration of listMigrations()) {
    try {
      await db.exec(migration.sql);
    } catch (error) {
      throw new Error(`${migration.file} failed: ${(error as Error).message}`, { cause: error });
    }
  }
  return db;
}

export function probeFiles(): string[] {
  return readdirSync(PROBES_DIR)
    .filter((file) => file.endsWith('.sql') && !file.startsWith('_'))
    .sort();
}

/** Runs one probe inside a transaction that is always rolled back. Returns the error, or null. */
export async function runProbe(db: Database, file: string): Promise<string | null> {
  return runProbeSql(db, read(resolve(PROBES_DIR, file)));
}

/** The same, for probe text given directly. */
export async function runProbeSql(db: Database, probe: string): Promise<string | null> {
  const setup = read(resolve(PROBES_DIR, '_setup.sql'));
  try {
    await db.exec(`begin;\n${setup}\n${probe}\nrollback;`);
    return null;
  } catch (error) {
    await db.exec('rollback; reset role;');
    return (error as Error).message;
  }
}

/** Runs one check file. Returns the error, or null when the check found nothing. */
export async function runCheck(db: Database, file: string): Promise<string | null> {
  try {
    await db.exec(read(resolve(CHECKS_DIR, file)));
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

export async function rows<T>(db: Database, sql: string): Promise<T[]> {
  return (await db.query<T>(sql)).rows;
}
