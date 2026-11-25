import type { Database } from './db.ts';

// Database migrations, applied in order. `PRAGMA user_version` records how
// many have run. Never edit a migration once released: add a new one.
// A migration is SQL, or a function for changes SQL can't make.

export type Migration = string | ((db: Database) => void);

export const migrations: Migration[] = [
  /* 1: initial schema */ `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    language TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY, -- SHA-256 of the token kept in the cookie
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    user_agent TEXT
  );
  CREATE INDEX sessions_user ON sessions (user_id);

  -- Every download asked for, in the order asked. The files themselves are in
  -- the media folder; paths here are relative to it.
  CREATE TABLE downloads (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    video_id TEXT NOT NULL,
    url TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('video', 'music')),
    title TEXT NOT NULL,
    channel TEXT,
    handle TEXT,
    duration INTEGER,
    folder TEXT NOT NULL, -- the folder picked ('' for the media folder)
    file_path TEXT NOT NULL, -- the file, with the channel's folder if asked
    overwrite INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed', 'canceled')),
    error TEXT,
    size INTEGER,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
  );
  CREATE INDEX downloads_status ON downloads (status, id);
  CREATE INDEX downloads_user_kind ON downloads (user_id, kind, id);
  `,
];
