import type { Language, User } from '#shared/types.ts';

import type { Database } from '../db.ts';
import { notFound } from '../errors.ts';

// Database rows and their conversion to API objects.

export interface UserRow {
  id: number;
  username: string;
  name: string;
  password_hash: string;
  language: Language;
  created_at: string;
  last_active_at: string | null;
}

export const SELECT_USER = `
  SELECT u.id, u.username, u.name, u.password_hash, u.language, u.created_at,
         (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_active_at
  FROM users u`;

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    language: row.language,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

/** A user, or 404. */
export function requireUser(db: Database, id: number): UserRow {
  const row = db.prepare(`${SELECT_USER} WHERE u.id = ?`).get(id) as UserRow | undefined;
  if (!row) throw notFound();
  return row;
}
