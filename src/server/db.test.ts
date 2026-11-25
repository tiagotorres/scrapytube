import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { APPLICATION_ID, openDatabase } from './db.ts';
import { migrations } from './migrations.ts';

const dirs: string[] = [];

/** A database file in a new temporary folder. */
function databaseFile() {
  const dir = mkdtempSync(path.join(tmpdir(), 'scrapytube-db-'));
  dirs.push(dir);
  return path.join(dir, 'scrapytube.db');
}

function pragma(db: DatabaseSync, name: 'application_id' | 'user_version'): number {
  return (db.prepare(`PRAGMA ${name}`).get() as Record<string, number>)[name]!;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('opening the database', () => {
  it('marks a new database as made by ScrapyTube, and leaves an up-to-date one alone', () => {
    const file = databaseFile();
    const db = openDatabase(file);
    expect(pragma(db, 'application_id')).toBe(APPLICATION_ID);
    expect(pragma(db, 'user_version')).toBe(migrations.length);
    db.close();

    const again = openDatabase(file);
    expect(pragma(again, 'user_version')).toBe(migrations.length);
    expect(again.prepare('SELECT COUNT(*) AS count FROM downloads').get()).toEqual({ count: 0 });
    again.close();
  });

  it("refuses another app's database, leaving it untouched", () => {
    const file = databaseFile();
    const other = new DatabaseSync(file);
    other.exec('CREATE TABLE things (id INTEGER PRIMARY KEY); PRAGMA user_version = 3;');
    other.close();

    expect(() => openDatabase(file)).toThrow(/not a ScrapyTube database/);
    const check = new DatabaseSync(file);
    expect(pragma(check, 'user_version')).toBe(3);
    check.close();
  });

  it('refuses a database made by a newer version', () => {
    const file = databaseFile();
    const newer = new DatabaseSync(file);
    newer.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${migrations.length + 1};`);
    newer.close();
    expect(() => openDatabase(file)).toThrow(/newer version of ScrapyTube/);
  });
});
