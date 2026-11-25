import { DatabaseSync } from 'node:sqlite';

import { migrations } from './migrations.ts';

export type Database = DatabaseSync;

/** Marks the file as a ScrapyTube database ("SCRT"). */
export const APPLICATION_ID = 0x53435254;

/** Opens (or creates) the database and brings its schema up to date. */
export function openDatabase(file: string): Database {
  const db = new DatabaseSync(file, { timeout: 5000 });
  if (file !== ':memory:') {
    // Readers don't block the writer, and a crash never corrupts the file.
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
  }
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: Database) {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  const { application_id: applicationId } = db.prepare('PRAGMA application_id').get() as {
    application_id: number;
  };
  if (current > 0 && applicationId !== APPLICATION_ID) {
    throw new Error('This file is not a ScrapyTube database. Use another DATA_DIR, or move the file away.');
  }
  if (current > migrations.length) {
    throw new Error(
      `The database was created by a newer version of ScrapyTube (schema ${current}, this version knows ${migrations.length}).`,
    );
  }
  for (let version = current; version < migrations.length; version++) {
    transaction(db, () => {
      const migration = migrations[version]!;
      if (version === 0) db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
      if (typeof migration === 'string') db.exec(migration);
      else migration(db);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

/** Runs `fn` in a transaction; nested calls join the outer transaction. */
export function transaction<T>(db: Database, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function now(): string {
  return new Date().toISOString();
}
