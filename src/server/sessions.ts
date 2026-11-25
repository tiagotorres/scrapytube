import { createHash, randomBytes } from 'node:crypto';

import type { Database } from './db.ts';
import { now } from './db.ts';

// A session is a random token kept in an HttpOnly cookie. Only its SHA-256
// is stored, so a copy of the database can't be used to sign in.

export const SESSION_COOKIE = 'scrapytube_session';

/** Sessions are extended at most this often, to avoid a write per request. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function expiry(days: number, from = Date.now()): string {
  return new Date(from + days * 86_400_000).toISOString();
}

export function createSession(
  db: Database,
  userId: number,
  sessionDays: number,
  userAgent: string | undefined,
): { token: string; id: string } {
  const token = randomBytes(32).toString('base64url');
  const id = hashToken(token);
  const timestamp = now();
  db.prepare(
    `INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, timestamp, timestamp, expiry(sessionDays), userAgent?.slice(0, 300) ?? null);
  return { token, id };
}

interface SessionRow {
  id: string;
  user_id: number;
  last_seen_at: string;
  expires_at: string;
}

/**
 * Returns the session for a cookie token, sliding its expiry forward.
 * `renewed` says the expiry moved, so the cookie should be sent again.
 */
export function resolveSession(
  db: Database,
  token: string,
  sessionDays: number,
): { id: string; userId: number; renewed: boolean } | null {
  const row = db
    .prepare(
      `SELECT s.id, s.user_id, s.last_seen_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .get(hashToken(token)) as SessionRow | undefined;
  if (!row) return null;
  const nowMs = Date.now();
  if (Date.parse(row.expires_at) <= nowMs) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
    return null;
  }
  const renewed = nowMs - Date.parse(row.last_seen_at) > TOUCH_INTERVAL_MS;
  if (renewed) {
    db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?').run(
      new Date(nowMs).toISOString(),
      expiry(sessionDays, nowMs),
      row.id,
    );
  }
  return { id: row.id, userId: row.user_id, renewed };
}

export function deleteSession(db: Database, id: string) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

/** Signs a user out everywhere, except (optionally) the current session. */
export function deleteUserSessions(db: Database, userId: number, exceptId?: string) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id IS NOT ?').run(userId, exceptId ?? null);
}

export function deleteExpiredSessions(db: Database) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
}
