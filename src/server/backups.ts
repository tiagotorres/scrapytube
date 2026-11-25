import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import type { Database } from './db.ts';

// `VACUUM INTO` writes a consistent copy of the database while the app runs.
function snapshot(db: Database, file: string) {
  rmSync(file, { force: true });
  db.prepare('VACUUM INTO ?').run(file);
}

/** A consistent copy of the whole database, for download. */
export function databaseCopy(db: Database, dataDir: string): Buffer {
  const file = path.join(dataDir, `.download-${randomUUID()}.db`);
  try {
    snapshot(db, file);
    return readFileSync(file);
  } finally {
    rmSync(file, { force: true });
  }
}
